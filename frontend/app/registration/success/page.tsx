import { redirect } from "next/navigation";

type RegistrationSuccessPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

const getApiBaseUrl = () => {
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
  return configured && configured !== "/" ? configured.replace(/\/+$/, "") : "http://localhost:3001";
};

// Never trust the redirect itself: confirm the order is actually PAID in the
// database before showing a success state. (#21, #35)
type PaymentOutcome = "paid" | "pending" | "failed" | "refund-pending" | "partially-refunded" | "refunded";

const fetchPaidStatus = async (accessToken: string): Promise<PaymentOutcome> => {
  try {
    const response = await fetch(`${getApiBaseUrl()}/payments/status/${encodeURIComponent(accessToken)}`, {
      cache: "no-store",
    });
    if (!response.ok) return "pending";
    const data = (await response.json()) as { paid?: boolean; status?: string };
    if (data.paid === true && data.status === "PAID") return "paid";
    if (data.status === "FAILED" || data.status === "CANCELLED") return "failed";
    if (data.status === "REFUND_PENDING") return "refund-pending";
    if (data.status === "PARTIALLY_REFUNDED") return "partially-refunded";
    if (data.status === "REFUNDED") return "refunded";
    return "pending";
  } catch {
    return "pending";
  }
};

const capturePayPalReturn = async (accessToken: string, providerOrderId: string) => {
  try {
    await fetch(`${getApiBaseUrl()}/payments/capture/paypal/${encodeURIComponent(accessToken)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ providerOrderId }),
      cache: "no-store",
    });
  } catch {
    // The order remains pending; a verified PayPal webhook can still settle it.
  }
};

export default async function RegistrationSuccess({ searchParams }: RegistrationSuccessPageProps) {
  const resolvedSearchParams = await searchParams;
  const params = new URLSearchParams();

  const accessToken = first(resolvedSearchParams?.order);
  const registrationId = first(resolvedSearchParams?.registration_id);
  const provider = first(resolvedSearchParams?.provider);
  const providerOrderId = first(resolvedSearchParams?.token);

  // Order-based flow: the DB is the source of truth for the payment outcome.
  if (accessToken && provider === "paypal" && providerOrderId) {
    await capturePayPalReturn(accessToken, providerOrderId);
  }
  const outcome = accessToken ? await fetchPaidStatus(accessToken) : "pending";
  const paymentState = outcome === "paid" ? "success" : outcome;
  params.set("payment", paymentState);

  if (accessToken) params.set("order", accessToken);
  if (registrationId) params.set("registration_id", registrationId);
  if (provider) params.set("provider", provider);

  redirect(`/?${params.toString()}`);
}
