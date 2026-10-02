import { redirect } from "next/navigation";

type RegistrationCancelPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

const getApiBaseUrl = () => {
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
  return configured && configured !== "/" ? configured.replace(/\/+$/, "") : "http://localhost:3001";
};

// A "cancel" redirect is only advisory. If a webhook already confirmed the
// payment, DB-truth wins and we treat it as a success. (#21, #35)
const isAlreadyPaid = async (accessToken: string): Promise<boolean> => {
  try {
    const response = await fetch(`${getApiBaseUrl()}/payments/status/${encodeURIComponent(accessToken)}`, {
      cache: "no-store",
    });
    if (!response.ok) return false;
    const data = (await response.json()) as { paid?: boolean; status?: string };
    return data.paid === true && data.status === "PAID";
  } catch {
    return false;
  }
};

// The buyer bailed out at the gateway. Cancel the open order now so its reserved
// coupon use is released immediately, rather than waiting for the stale-order
// sweeper. Safe/idempotent server-side: cancelOrder no-ops on PAID/CANCELLED.
const cancelOpenOrder = async (accessToken: string): Promise<void> => {
  try {
    await fetch(`${getApiBaseUrl()}/payments/cancel/${encodeURIComponent(accessToken)}`, {
      method: "POST",
      cache: "no-store",
    });
  } catch {
    // Best-effort: the sweeper will still cancel it later if this fails.
  }
};

export default async function RegistrationCancel({ searchParams }: RegistrationCancelPageProps) {
  const resolvedSearchParams = await searchParams;
  const params = new URLSearchParams();

  const accessToken = first(resolvedSearchParams?.order);
  const registrationId = first(resolvedSearchParams?.registration_id);
  const provider = first(resolvedSearchParams?.provider);

  const paid = accessToken ? await isAlreadyPaid(accessToken) : false;
  if (accessToken && !paid) await cancelOpenOrder(accessToken);
  params.set("payment", paid ? "success" : "cancel");

  if (accessToken) params.set("order", accessToken);
  if (registrationId) params.set("registration_id", registrationId);
  if (provider) params.set("provider", provider);

  redirect(`/?${params.toString()}`);
}
