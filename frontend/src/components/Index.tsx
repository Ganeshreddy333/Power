"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Download } from "lucide-react";
import Navbar from "@/components/Navbar";
import HeroSection from "@/components/HeroSection";
import AboutSection from "@/components/AboutSection";
import ImportantDates from "@/components/ImportantDates";
import ScheduleSection from "@/components/ScheduleSection";
import SpeakersSection from "@/components/SpeakersSection";
import MediaPartnersSection from "@/components/MediaPartnersSection";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { downloadReceiptByToken, getPaymentStatus, type OrderStatus } from "@/integrations/api/payments";

const formatMoney = (value: number | undefined, currency: string | undefined) =>
  value == null || Number.isNaN(value) ? null : `${currency || "USD"} ${value.toFixed(2)}`;

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString();
};

const RECEIPT_STATUSES = ["success", "refund-pending", "partially-refunded", "refunded"];
type VerifiedOutcome = "success" | "pending" | "failed" | "refund-pending" | "partially-refunded" | "refunded";
type VerificationState =
  | { kind: "checking" | "unavailable"; key: string }
  | { kind: "verified"; key: string; outcome: VerifiedOutcome; status: OrderStatus };

const resolveVerifiedOutcome = (status: OrderStatus): VerifiedOutcome => {
  if (status.status === "PAID") return status.paid ? "success" : "pending";
  if (status.status === "REFUND_PENDING") return "refund-pending";
  if (status.status === "PARTIALLY_REFUNDED") return "partially-refunded";
  if (status.status === "REFUNDED") return "refunded";
  if (status.status === "FAILED" || status.status === "CANCELLED") return "failed";
  return "pending";
};

const IndexContent = () => {
  const searchParams = useSearchParams();
  const paymentStatus = searchParams.get("payment");
  const orderToken = searchParams.get("order");
  const { toast } = useToast();
  const [downloading, setDownloading] = useState(false);
  const [verification, setVerification] = useState<VerificationState | null>(null);

  // Query parameters only request a fresh status check; they never establish the
  // displayed state. A failed or stale check cannot leave a success banner behind.
  useEffect(() => {
    if (!paymentStatus || !orderToken) {
      setVerification(null);
      return;
    }
    let active = true;
    const key = `${paymentStatus}:${orderToken}`;
    setVerification({ kind: "checking", key });
    getPaymentStatus(orderToken)
      .then((status) => {
        if (active) setVerification({ kind: "verified", key, outcome: resolveVerifiedOutcome(status), status });
      })
      .catch(() => {
        if (active) setVerification({ kind: "unavailable", key });
      });
    return () => {
      active = false;
    };
  }, [paymentStatus, orderToken]);

  const handleDownloadReceipt = async () => {
    if (!orderToken) return;
    setDownloading(true);
    try {
      await downloadReceiptByToken(orderToken);
    } catch (error) {
      toast({
        title: "Could not download receipt",
        description: error instanceof Error ? error.message : "Please try again shortly.",
        variant: "destructive",
      });
    } finally {
      setDownloading(false);
    }
  };

  const requestKey = paymentStatus && orderToken ? `${paymentStatus}:${orderToken}` : null;
  const activeVerification = verification?.key === requestKey ? verification : null;
  const verifiedOutcome = activeVerification?.kind === "verified" ? activeVerification.outcome : null;
  const details = activeVerification?.kind === "verified" && RECEIPT_STATUSES.includes(activeVerification.outcome)
    ? activeVerification.status
    : null;
  const paymentMessages: Record<string, string> = {
    success: "Payment confirmed. A confirmation email with your acknowledgement number is on its way.",
    pending: "Your payment return was received. We are confirming it securely with the payment provider; you will receive an email once confirmed.",
    failed: "Your payment could not be completed. Your registration remains pending — please try again or contact support.",
    "refund-pending": "Your refund is being processed by the payment provider.",
    "partially-refunded": "Part of this payment has been refunded. The receipt below shows the recorded refund details.",
    refunded: "This payment has been refunded. The original receipt remains available below.",
  };
  const paymentMessage = !paymentStatus || !orderToken
    ? null
    : activeVerification?.kind === "checking" || !activeVerification
      ? "Verifying payment status with the server…"
      : activeVerification.kind === "unavailable"
        ? "We could not verify this payment right now. No successful payment has been confirmed."
        : paymentMessages[verifiedOutcome || "pending"];
  const paymentTone =
    verifiedOutcome === "success"
      ? "border-teal/20 bg-teal/10"
      : verifiedOutcome === "failed" || verifiedOutcome === "refunded"
        ? "border-red-300 bg-red-50 text-red-800"
        : "border-teal/20 bg-teal/10";

  const detailRows: Array<[string, string | null]> = details
    ? [
        ["Name", details.customerName ?? null],
        ["Registration ID", details.registrationId ?? null],
        ["Order Number", details.orderNumber ?? null],
        ["Order Amount", formatMoney(details.amount?.final, details.amount?.currency)],
        ["Charged at Gateway", details.gatewayAmount == null ? null : formatMoney(details.gatewayAmount / 100, details.gatewayCurrency)],
        ["Coupon", details.couponCode ?? null],
        ["Discount", details.amount?.discount ? formatMoney(details.amount.discount, details.amount.currency) : null],
        ["Accommodation", details.accommodation
          ? `${details.accommodation.name}: ${details.accommodation.checkIn} to ${details.accommodation.checkOut} (${details.accommodation.nights} night(s), ${formatMoney(details.accommodation.total, details.accommodation.currency)})`
          : null],
        ["Payment Method", details.method ?? null],
        ["Payment ID", details.gatewayPaymentId ?? null],
        ["Order ID", details.gatewayOrderId ?? null],
        ["Payment Date", formatDateTime(details.paidAt)],
        ["Status", details.status ?? null],
      ]
    : [];

  return (
    <div className="min-h-screen">
      {paymentMessage ? (
        <div className={`border-b px-4 py-3 text-center text-sm font-medium text-foreground ${paymentTone}`}>
          <span>{paymentMessage}</span>
          {details && orderToken ? (
            <div className="mt-3 flex flex-col items-center gap-3">
              <div className="w-full max-w-md rounded-md border border-teal/30 bg-card p-4 text-left text-sm shadow-sm">
                <p className="mb-2 font-display text-base font-bold text-teal">
                  {details.status === "REFUNDED" ? "Payment Refunded" : details.status === "PARTIALLY_REFUNDED" ? "Partially Refunded" : details.status === "REFUND_PENDING" ? "Refund Pending" : "Payment Successful"}
                </p>
                <dl className="space-y-1">
                  {detailRows
                    .filter(([, value]) => value)
                    .map(([label, value]) => (
                      <div key={label} className="flex justify-between gap-4">
                        <dt className="text-muted-foreground">{label}</dt>
                        <dd className="break-all text-right font-medium text-foreground">{value}</dd>
                      </div>
                    ))}
                </dl>
              </div>
              <Button size="sm" variant="outline" onClick={handleDownloadReceipt} disabled={downloading}>
                <Download className="mr-1 h-4 w-4" />
                {downloading ? "Preparing receipt…" : "Download Receipt"}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
      <Navbar />
      <HeroSection />
      <AboutSection />
      <ImportantDates />
      <ScheduleSection />
      <SpeakersSection showEmptyState={false} />
      <MediaPartnersSection />
      <Footer />
    </div>
  );
};

const Index = () => (
  <Suspense fallback={<div className="min-h-screen bg-background" /> }>
    <IndexContent />
  </Suspense>
);

export default Index;
