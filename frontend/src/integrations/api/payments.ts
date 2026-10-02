// Client for the anonymous, order-based payment API. Ownership is proven by the
// access token the backend mints per order — there is no user login.

const getApiBaseUrl = () => {
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
  return configured && configured !== "/" ? configured.replace(/\/+$/, "") : "http://localhost:3001";
};

const API_BASE_URL = getApiBaseUrl();

export type OrderAmount = {
  base: number;
  discount: number;
  tax: number;
  final: number;
  currency: string;
};

export type AccommodationBreakdown = {
  optionId: string;
  name: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  pricePerNight: number;
  total: number;
  currency: string;
};

export type CheckoutQuote = {
  accommodation: AccommodationBreakdown | null;
  amount: OrderAmount;
};

export type CreatedOrder = {
  orderId: string;
  orderNumber: string;
  accessToken: string;
  quantity: number;
  provider: "stripe" | "paypal" | "razorpay";
  status: string;
  amount: OrderAmount;
  gatewayAmount: number;
  gatewayCurrency: string;
  providerOrderId: string;
  keyId?: string;
  checkoutUrl?: string;
  accommodation?: AccommodationBreakdown | null;
  prefill: { name?: string; email?: string; contact?: string };
};

export type OrderStatus = {
  orderNumber: string;
  provider: string;
  quantity: number;
  status: "CREATED" | "PENDING" | "PAID" | "FAILED" | "CANCELLED" | "REFUND_PENDING" | "PARTIALLY_REFUNDED" | "REFUNDED";
  paid: boolean;
  amount: { base?: number; discount?: number; tax?: number; final: number; currency: string };
  gatewayAmount?: number;
  gatewayCurrency?: string;
  registrationId: string;
  customerName?: string | null;
  couponCode?: string | null;
  method?: string | null;
  gatewayPaymentId?: string | null;
  gatewayOrderId?: string | null;
  paidAt?: string | null;
  attempts: Array<{ status: string; method?: string | null; createdAt?: string }>;
  accommodation?: AccommodationBreakdown | null;
};

const postJson = async <T>(path: string, body: unknown): Promise<T> => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error((data && (data.message || data.error)) || response.statusText || "Request failed");
  return data as T;
};

export const createPaymentOrder = (registrationId: string, provider: string) =>
  postJson<CreatedOrder>("/payments/create-order", { registrationId, provider });

export const quoteRegistration = (input: {
  planKey: string;
  couponCode?: string | null;
  quantity: number;
  accommodationOptionId?: string | null;
  accommodationCheckIn?: string | null;
  accommodationCheckOut?: string | null;
}) => postJson<CheckoutQuote>("/payments/quote", input);

export const verifyRazorpayPayment = (payload: {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}) => postJson<{ status: string; orderNumber: string; accessToken: string }>("/payments/verify", payload);

export const getPaymentStatus = async (accessToken: string): Promise<OrderStatus> => {
  const response = await fetch(`${API_BASE_URL}/payments/status/${encodeURIComponent(accessToken)}`, {
    cache: "no-store",
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error((data && (data.message || data.error)) || "Could not load payment status");
  return data as OrderStatus;
};

export const cancelPaymentOrder = (accessToken: string) =>
  postJson<{ status: string; orderNumber: string }>(`/payments/cancel/${encodeURIComponent(accessToken)}`, {});

export type ReceiptPayload = {
  registrationId: string;
  receiptNumber: string;
  acknowledgementNumber: string;
  pdfBase64: string;
  mimeType: string;
};

// Fetches the buyer's receipt/invoice by access token (only served once PAID).
export const getReceiptByToken = async (accessToken: string): Promise<ReceiptPayload> => {
  const response = await fetch(`${API_BASE_URL}/payments/receipt/${encodeURIComponent(accessToken)}`, {
    cache: "no-store",
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error((data && (data.message || data.error)) || "Could not load receipt");
  return data as ReceiptPayload;
};

// Downloads the receipt PDF in the browser (base64 -> Blob -> anchor click).
export const downloadReceiptByToken = async (accessToken: string): Promise<void> => {
  const receipt = await getReceiptByToken(accessToken);
  if (!receipt.pdfBase64) throw new Error("Receipt content is missing");
  const blob = new Blob([Uint8Array.from(atob(receipt.pdfBase64), (char) => char.charCodeAt(0))], {
    type: receipt.mimeType || "application/pdf",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${receipt.receiptNumber || "receipt"}.pdf`;
  link.click();
  URL.revokeObjectURL(url);
};

// --- Razorpay Checkout.js -----------------------------------------------------

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void; on: (event: string, handler: (payload: unknown) => void) => void };
  }
}

const RAZORPAY_SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";

export const loadRazorpayCheckout = (): Promise<void> =>
  new Promise((resolve, reject) => {
    if (typeof window === "undefined") return reject(new Error("Razorpay is only available in the browser"));
    if (window.Razorpay) return resolve();
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${RAZORPAY_SCRIPT}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Failed to load Razorpay checkout")));
      return;
    }
    const script = document.createElement("script");
    script.src = RAZORPAY_SCRIPT;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Razorpay checkout"));
    document.body.appendChild(script);
  });

export type RazorpayResult =
  | { outcome: "paid"; response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string } }
  | { outcome: "dismissed" }
  | { outcome: "failed"; message: string };

// Opens the Razorpay modal and resolves once the buyer pays, dismisses, or fails.
// `preferCard` narrows the modal to the credit/debit card form (used by the
// dedicated "Card" choice); the plain Razorpay choice leaves every method on.
export const openRazorpayCheckout = async (
  order: CreatedOrder,
  options: { preferCard?: boolean } = {},
): Promise<RazorpayResult> => {
  await loadRazorpayCheckout();
  if (!window.Razorpay) throw new Error("Razorpay checkout is unavailable");
  if (!order.keyId) throw new Error("Razorpay key is missing");

  return new Promise<RazorpayResult>((resolve) => {
    let settled = false;
    const finish = (result: RazorpayResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const checkoutOptions: Record<string, unknown> = {
      key: order.keyId,
      order_id: order.providerOrderId,
      amount: order.gatewayAmount,
      currency: order.gatewayCurrency,
      name: "Conference Registration",
      description: `Order ${order.orderNumber}`,
      prefill: {
        name: order.prefill.name || "",
        email: order.prefill.email || "",
        contact: order.prefill.contact || "",
      },
      notes: { order_id: order.orderId },
      handler: (response: unknown) => {
        const r = response as { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
        finish({ outcome: "paid", response: r });
      },
      modal: { ondismiss: () => finish({ outcome: "dismissed" }) },
      theme: { color: "#0f766e" },
    };

    // Card-only view for the dedicated "Credit / Debit Card" choice. Hides the
    // other Razorpay blocks so the buyer lands straight on the card form.
    if (options.preferCard) {
      checkoutOptions.config = {
        display: {
          blocks: { cards: { name: "Pay with Credit / Debit Card", instruments: [{ method: "card" }] } },
          sequence: ["block.cards"],
          preferences: { show_default_blocks: false },
        },
      };
    }

    const instance = new window.Razorpay!(checkoutOptions);

    instance.on("payment.failed", (payload: unknown) => {
      const error = (payload as { error?: { description?: string } })?.error;
      finish({ outcome: "failed", message: error?.description || "Payment failed" });
    });

    instance.open();
  });
};
