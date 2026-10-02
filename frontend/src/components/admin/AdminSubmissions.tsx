import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/integrations/api/client";
import type { Tables } from "@/integrations/api/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CalendarDays, Download, ExternalLink, Eye, FileDown, RefreshCw, RotateCcw, Search, Trash2, X } from "lucide-react";

type RegistrationIntent = Tables<"registration_intents">;
type AbstractSubmission = Tables<"abstract_submissions">;
type ContactMessage = Tables<"contact_messages">;

// The transaction ledger lives in the orders/payments tables (one row per
// payment attempt), separate from the single mutable registration_intents row.
// Admin reads them through the generic /data/:table endpoint.
type OrderRow = {
  id: string;
  order_number: string;
  registration_id: string;
  access_token: string;
  provider: string;
  quantity: number;
  final_amount: number | string;
  currency: string;
  gateway_amount: number | string;
  gateway_currency: string;
  coupon_code: string | null;
  accommodation_option_id: string | null;
  accommodation_name: string | null;
  accommodation_check_in: string | null;
  accommodation_check_out: string | null;
  accommodation_nights: number | null;
  accommodation_price_per_night: number | string | null;
  accommodation_total: number | string | null;
  status: string;
  provider_order_id: string | null;
  created_at: string;
};

type PaymentRow = {
  id: string;
  order_id: string;
  provider: string;
  provider_payment_id: string | null;
  provider_order_id: string | null;
  status: string;
  method: string | null;
  amount: number | string;
  currency: string;
  gateway_amount: number | string | null;
  gateway_currency: string | null;
  error_description: string | null;
  created_at: string;
};

type RefundRow = {
  id: string;
  order_id: string;
  provider_refund_id: string | null;
  amount_minor: number | string;
  currency: string;
  status: string;
  created_at: string;
};

type PaymentAuditRow = {
  id: string;
  actor_user_id: string | null;
  action: string;
  previous_status: string | null;
  new_status: string | null;
  amount_minor: number | string | null;
  currency: string | null;
  provider_reference: string | null;
  created_at: string;
};

type PaymentProviderStatus = {
  stripe: { configured: boolean; mode: string };
  paypal: { configured: boolean; mode: string };
  razorpay: { configured: boolean; mode: string };
  phonepe: { configured: boolean; mode: string };
};

const getApiBaseUrl = () => {
  const configured = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001").trim();
  return configured && configured !== "/" ? configured.replace(/\/+$/, "") : "http://localhost:3001";
};

const getAdminAuthHeaders = (): Record<string, string> => {
  try {
    const session = JSON.parse(window.localStorage.getItem("localAuthSession") || "null");
    return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
  } catch {
    return {};
  }
};

const formatDate = (value: string | null) => {
  if (!value) return "-";
  return new Date(value).toLocaleString();
};

const getPaymentBadgeVariant = (status: string) => {
  const normalized = status.toLowerCase();
  if (["paid", "success", "successful", "completed"].includes(normalized)) return "default";
  if (["failed", "cancelled", "canceled"].includes(normalized)) return "destructive";
  if (["refunded", "partially_refunded", "refund_pending", "refund"].includes(normalized)) return "outline";
  return "secondary";
};

// The internal orders.id is stamped into gateway_response.orderId when an order
// is confirmed PAID (see syncPaidState). The admin refund endpoint is keyed by
// that internal id, so we recover it here from the registration row.
const getInternalOrderId = (registration: RegistrationIntent): string | null => {
  const response = registration.gateway_response;
  if (response && typeof response === "object" && !Array.isArray(response)) {
    const orderId = (response as Record<string, unknown>).orderId;
    if (typeof orderId === "string" && orderId.trim()) return orderId;
  }
  return null;
};

const getStoredFiles = (value: unknown): Array<{ name: string; path: string }> => {
  const parsedValue = typeof value === "string" && value.trim().startsWith("[")
    ? (() => {
        try {
          return JSON.parse(value) as unknown;
        } catch {
          return value;
        }
      })()
    : value;

  if (!Array.isArray(parsedValue)) return [];

  return parsedValue
    .map((item) => {
      if (typeof item === "string") return { name: item.split("/").pop() || "Download", path: item };
      if (item && typeof item === "object" && "path" in item) {
        const file = item as { name?: unknown; path?: unknown };
        return {
          name: typeof file.name === "string" ? file.name : "Download",
          path: typeof file.path === "string" ? file.path : "",
        };
      }
      return null;
    })
    .filter((item): item is { name: string; path: string } => Boolean(item?.path));
};

const AdminSubmissions = () => {
  const [registrations, setRegistrations] = useState<RegistrationIntent[]>([]);
  const [abstracts, setAbstracts] = useState<AbstractSubmission[]>([]);
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [refunds, setRefunds] = useState<RefundRow[]>([]);
  const [auditOrder, setAuditOrder] = useState<OrderRow | null>(null);
  const [auditRows, setAuditRows] = useState<PaymentAuditRow[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [providerStatus, setProviderStatus] = useState<PaymentProviderStatus | null>(null);
  const [updatingAbstractId, setUpdatingAbstractId] = useState<string | null>(null);
  const [selectedRegistration, setSelectedRegistration] = useState<RegistrationIntent | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refundingId, setRefundingId] = useState<string | null>(null);
  const [reconcilingId, setReconcilingId] = useState<string | null>(null);
  // Two-step delete confirmation. `deleteTarget` holds the record to remove,
  // `deleteStep` advances 1 -> 2, and `deletingId` blocks double-clicks while the
  // DELETE request is in flight.
  const [deleteTarget, setDeleteTarget] = useState<{ table: string; id: string; title: string; body: string } | null>(null);
  const [deleteStep, setDeleteStep] = useState<1 | 2>(1);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [registrationSearch, setRegistrationSearch] = useState("");
  // Payments-tab filters: a date preset (or custom from/to range), a status
  // filter, and a free-text search over attendee + gateway identifiers.
  const [paymentSearch, setPaymentSearch] = useState("");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState("all");
  const [datePreset, setDatePreset] = useState("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const { toast } = useToast();

  const fetchData = useCallback(async () => {
    const [registrationsResult, abstractsResult, messagesResult] = await Promise.all([
      apiClient.from("registration_intents").select("*").order("created_at", { ascending: false }),
      apiClient.from("abstract_submissions").select("*").order("created_at", { ascending: false }),
      apiClient.from("contact_messages").select("*").order("created_at", { ascending: false }),
    ]);

    if (registrationsResult.error || abstractsResult.error || messagesResult.error) {
      toast({
        title: "Could not load submissions",
        description:
          registrationsResult.error?.message ||
          abstractsResult.error?.message ||
          messagesResult.error?.message ||
          "Unknown error",
        variant: "destructive",
      });
      return;
    }

    setRegistrations(registrationsResult.data || []);
    setAbstracts(abstractsResult.data || []);
    setMessages(messagesResult.data || []);

    // The orders/payments ledger is the source of truth for individual
    // transactions (a single registrant can have many attempts). It is read
    // through the generic admin data endpoint.
    try {
      const [ordersResponse, paymentsResponse, refundsResponse] = await Promise.all([
        fetch(`${getApiBaseUrl()}/data/orders`, { headers: getAdminAuthHeaders() }),
        fetch(`${getApiBaseUrl()}/data/payments`, { headers: getAdminAuthHeaders() }),
        fetch(`${getApiBaseUrl()}/data/refunds`, { headers: getAdminAuthHeaders() }),
      ]);
      setOrders(ordersResponse.ok ? ((await ordersResponse.json()) as OrderRow[]) : []);
      setPayments(paymentsResponse.ok ? ((await paymentsResponse.json()) as PaymentRow[]) : []);
      setRefunds(refundsResponse.ok ? ((await refundsResponse.json()) as RefundRow[]) : []);
    } catch {
      setOrders([]);
      setPayments([]);
      setRefunds([]);
    }

    try {
      const response = await fetch(`${getApiBaseUrl()}/functions/payment-provider-status`, {
        headers: getAdminAuthHeaders(),
      });
      if (response.ok) {
        const data = (await response.json()) as PaymentProviderStatus;
        setProviderStatus(data);
      }
    } catch {
      setProviderStatus(null);
    }
  }, [toast]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchData();
    } finally {
      setRefreshing(false);
    }
  }, [fetchData]);

  // Core refund call, keyed by the internal orders.id. `busyKey` is whatever the
  // caller tracks its spinner by (registration id or order id).
  const runRefund = async (orderId: string, label: string, busyKey: string) => {
    const confirmed = window.confirm(
      `Refund ${label}? This moves real money at the payment gateway and cannot be undone.`,
    );
    if (!confirmed) return;

    setRefundingId(busyKey);
    try {
      const response = await fetch(`${getApiBaseUrl()}/payments/admin/refund/${encodeURIComponent(orderId)}`, {
        method: "POST",
        headers: getAdminAuthHeaders(),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message || "The refund could not be processed.");
      }
      toast({ title: "Refund initiated", description: `${label} has been refunded.` });
      await fetchData();
    } catch (error) {
      toast({
        title: "Could not refund payment",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setRefundingId(null);
    }
  };

  const refundRegistration = async (registration: RegistrationIntent) => {
    const orderId = getInternalOrderId(registration);
    if (!orderId) {
      toast({
        title: "Refund unavailable",
        description: "No internal order reference is on file for this registration, so it cannot be refunded automatically.",
        variant: "destructive",
      });
      return;
    }
    await runRefund(
      orderId,
      `the ${registration.currency} ${Number(registration.amount_usd).toFixed(2)} payment for ${registration.full_name}`,
      registration.id,
    );
  };

  const refundOrder = async (order: OrderRow) => {
    await runRefund(
      order.id,
      `order ${order.order_number} (${order.currency} ${Number(order.final_amount).toFixed(2)})`,
      order.id,
    );
  };

  const viewPaymentAudit = async (order: OrderRow) => {
    setAuditOrder(order);
    setAuditRows([]);
    setAuditError(null);
    setAuditLoading(true);
    try {
      const response = await fetch(`${getApiBaseUrl()}/payments/admin/audit/${encodeURIComponent(order.id)}`, {
        headers: getAdminAuthHeaders(),
        cache: "no-store",
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.message || "Audit history could not be loaded.");
      setAuditRows((result || []) as PaymentAuditRow[]);
    } catch (error) {
      setAuditError(error instanceof Error ? error.message : "Audit history could not be loaded.");
    } finally {
      setAuditLoading(false);
    }
  };

  const reconcileOrder = async (order: OrderRow) => {
    setReconcilingId(order.id);
    try {
      const response = await fetch(`${getApiBaseUrl()}/payments/admin/reconcile/${encodeURIComponent(order.id)}`, {
        method: "POST",
        headers: getAdminAuthHeaders(),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message || "Payment reconciliation failed.");
      toast({
        title: "Payment reconciled",
        description: `Order ${order.order_number} is ${String(payload?.status || "updated").toLowerCase()}.`,
      });
      await fetchData();
    } catch (error) {
      toast({
        title: "Could not reconcile payment",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setReconcilingId(null);
    }
  };

  const openStoredFile = async (path: string) => {
    try {
      const normalizedPath = path
        .replace(/^.*\/storage\/abstract-assets\//, "")
        .replace(/^abstract-assets\//, "")
        .replace(/^\/+/, "")
        .split("/")
        .map((segment) => encodeURIComponent(segment))
        .join("/");

      const downloadUrl = `${getApiBaseUrl()}/storage/abstract-assets/download/${normalizedPath}`;
      const response = await fetch(downloadUrl, {
        headers: getAdminAuthHeaders(),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.message || "The file could not be downloaded.");
      }

      const blob = await response.blob();
      if (!blob.size) throw new Error("The downloaded file is empty.");

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = path.split("/").pop() || "abstract-file";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast({
        title: "Could not download file",
        description: error instanceof Error ? error.message : "The file could not be downloaded.",
        variant: "destructive",
      });
    }
  };

  const downloadReceipt = async (registrationId: string, orderId?: string) => {
    try {
      const query = orderId ? `?orderId=${encodeURIComponent(orderId)}` : "";
      const response = await fetch(`${getApiBaseUrl()}/functions/receipt/${registrationId}${query}`, {
        headers: getAdminAuthHeaders(),
      });
      if (!response.ok) {
        throw new Error("Receipt could not be generated");
      }

      const data = (await response.json()) as { pdfBase64?: string; receiptNumber?: string; acknowledgementNumber?: string };
      if (!data.pdfBase64) {
        throw new Error("Receipt content missing");
      }

      const file = new Blob([Uint8Array.from(atob(data.pdfBase64), (char) => char.charCodeAt(0))], {
        type: "application/pdf",
      });
      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${data.receiptNumber || registrationId}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast({
        title: "Could not download receipt",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  const openExternalUrl = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const updateAbstractStatus = async (id: string, status: "approved" | "rejected") => {
    setUpdatingAbstractId(id);

    const { error } = await apiClient
      .from("abstract_submissions")
      .update({ status })
      .eq("id", id);

    if (error) {
      toast({
        title: "Could not update abstract",
        description: error.message,
        variant: "destructive",
      });
    } else {
      setAbstracts((current) => current.map((item) => (item.id === id ? { ...item, status } : item)));
      toast({ title: `Abstract ${status}`, description: `The submission has been ${status}.` });
    }

    setUpdatingAbstractId(null);
  };

  // Opens the confirmation flow at step 1. Deletion only runs after the admin
  // confirms twice (see confirmDelete). Backend authorization is enforced by the
  // admin guard on DELETE /data/:table/:id — the button is not the security.
  const requestDelete = (target: { table: string; id: string; title: string; body: string }) => {
    setDeleteTarget(target);
    setDeleteStep(1);
  };

  const cancelDelete = () => {
    if (deletingId) return; // don't dismiss mid-request
    setDeleteTarget(null);
    setDeleteStep(1);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    // First confirmation just advances to the final one.
    if (deleteStep === 1) {
      setDeleteStep(2);
      return;
    }
    if (deletingId) return; // guard against duplicate/double-click deletes
    const { table, id } = deleteTarget;
    setDeletingId(id);
    // Raw DELETE against the admin data endpoint so it works uniformly for the
    // orders/payments ledger too (not part of the typed apiClient table map).
    // Authorization is enforced server-side by the admin guard.
    let ok = false;
    let message = "Could not delete record";
    try {
      const response = await fetch(`${getApiBaseUrl()}/data/${table}/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: getAdminAuthHeaders(),
      });
      ok = response.ok;
      if (!ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        message = payload?.message || response.statusText || message;
      }
    } catch (error) {
      message = error instanceof Error ? error.message : message;
    }
    setDeletingId(null);
    if (!ok) {
      toast({ title: "Could not delete record", description: message, variant: "destructive" });
      return;
    }
    toast({ title: "Record deleted" });
    if (selectedRegistration?.id === id) setSelectedRegistration(null);
    setDeleteTarget(null);
    setDeleteStep(1);
    // Reload everything so the cascade (orders/payments removed with a
    // registration) is reflected across every tab from the DB truth.
    await fetchData();
  };

  const registrationCounts = registrations.reduce(
    (counts, item) => {
      const status = item.payment_status.toLowerCase();
      if (["paid", "success", "successful", "completed"].includes(status)) counts.successful += 1;
      else if (["failed", "cancelled", "canceled"].includes(status)) counts.failed += 1;
      else counts.processing += 1;
      return counts;
    },
    { successful: 0, failed: 0, processing: 0 },
  );

  const search = registrationSearch.trim().toLowerCase();
  // Also index each registration's orders/payments so admins can search by the
  // gateway identifiers (Razorpay order id / payment id), order number, coupon,
  // or access token — not just the fields stored on the registration row. (#14)
  const orderSearchIndex = new Map<string, string>();
  const appendSearch = (regId: string | null | undefined, parts: Array<unknown>) => {
    if (!regId) return;
    const extra = parts.filter(Boolean).map((value) => String(value).toLowerCase()).join(" ");
    if (!extra) return;
    orderSearchIndex.set(regId, `${orderSearchIndex.get(regId) ?? ""} ${extra}`.trim());
  };
  for (const order of orders) {
    appendSearch(order.registration_id, [
      order.order_number,
      order.provider_order_id,
      order.coupon_code,
      order.access_token,
      order.status,
    ]);
  }
  for (const payment of payments) {
    const regId = orders.find((o) => o.id === payment.order_id)?.registration_id;
    appendSearch(regId, [
      payment.provider_payment_id,
      payment.provider_order_id,
      payment.method,
      payment.status,
    ]);
  }
  const filteredRegistrations = search
    ? registrations.filter((item) =>
        [
          item.id,
          item.full_name,
          item.email,
          item.phone,
          item.affiliation,
          item.country,
          item.designation,
          item.plan_name,
          item.plan_key,
          item.payment_provider,
          item.payment_status,
          item.status,
          item.payment_reference,
          item.payment_order_id,
          orderSearchIndex.get(item.id),
        ]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(search)),
      )
    : registrations;

  // Registrant lookup for the transaction ledger, keyed by registration id.
  const registrationById = new Map(registrations.map((item) => [item.id, item]));
  // Latest payment attempt per order (payments arrive newest-first), used to show
  // the real gateway payment reference / method / failure reason on each order.
  const latestPaymentByOrder = new Map<string, PaymentRow>();
  for (const payment of payments) {
    if (!latestPaymentByOrder.has(payment.order_id)) latestPaymentByOrder.set(payment.order_id, payment);
  }
  const refundsByOrder = new Map<string, RefundRow[]>();
  for (const refund of refunds) {
    refundsByOrder.set(refund.order_id, [...(refundsByOrder.get(refund.order_id) ?? []), refund]);
  }

  // --- Payments tab: date + status + text filtering ------------------------
  // Resolve the active date window (local time) from the preset or the custom
  // range. `from`/`to` are inclusive bounds; null means unbounded on that side.
  const resolveDateRange = (): { from: Date | null; to: Date | null } => {
    const now = new Date();
    const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
    switch (datePreset) {
      case "today":
        return { from: startOfDay(now), to: endOfDay(now) };
      case "yesterday": {
        const y = new Date(now);
        y.setDate(now.getDate() - 1);
        return { from: startOfDay(y), to: endOfDay(y) };
      }
      case "7d": {
        const s = new Date(now);
        s.setDate(now.getDate() - 6);
        return { from: startOfDay(s), to: endOfDay(now) };
      }
      case "30d": {
        const s = new Date(now);
        s.setDate(now.getDate() - 29);
        return { from: startOfDay(s), to: endOfDay(now) };
      }
      case "month":
        return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: endOfDay(now) };
      case "custom":
        return {
          from: customFrom ? new Date(`${customFrom}T00:00:00`) : null,
          to: customTo ? new Date(`${customTo}T23:59:59.999`) : null,
        };
      default:
        return { from: null, to: null };
    }
  };

  const { from: dateFrom, to: dateTo } = resolveDateRange();
  const paymentSearchTerm = paymentSearch.trim().toLowerCase();
  const paymentFiltersActive =
    datePreset !== "all" || paymentStatusFilter !== "all" || Boolean(paymentSearchTerm);

  const filteredOrders = orders.filter((order) => {
    const created = new Date(order.created_at);
    if (dateFrom && created < dateFrom) return false;
    if (dateTo && created > dateTo) return false;
    if (paymentStatusFilter !== "all" && order.status.toUpperCase() !== paymentStatusFilter) return false;
    if (paymentSearchTerm) {
      const registrant = registrationById.get(order.registration_id);
      const payment = latestPaymentByOrder.get(order.id);
      const haystack = [
        registrant?.full_name,
        registrant?.email,
        registrant?.phone,
        order.order_number,
        order.provider_order_id,
        order.coupon_code,
        order.provider,
        payment?.provider_payment_id,
        payment?.method,
        order.registration_id,
      ]
        .filter(Boolean)
        .map((value) => String(value).toLowerCase())
        .join(" ");
      if (!haystack.includes(paymentSearchTerm)) return false;
    }
    return true;
  });

  // Headline numbers for the current filter: attempt count and the collected
  // total per currency (only PAID orders count toward money collected).
  const paymentSummary = filteredOrders.reduce(
    (acc, order) => {
      acc.count += 1;
      if (order.status.toUpperCase() === "PAID") {
        acc.paidCount += 1;
        const currency = order.currency || "USD";
        acc.paidTotals[currency] = (acc.paidTotals[currency] || 0) + (Number(order.final_amount) || 0);
      }
      return acc;
    },
    { count: 0, paidCount: 0, paidTotals: {} as Record<string, number> },
  );
  const paidTotalLabel =
    Object.entries(paymentSummary.paidTotals)
      .map(([currency, total]) => `${currency} ${total.toFixed(2)}`)
      .join(" · ") || "—";

  const clearPaymentFilters = () => {
    setDatePreset("all");
    setPaymentStatusFilter("all");
    setPaymentSearch("");
    setCustomFrom("");
    setCustomTo("");
  };

  const exportPaymentsCsv = () => {
    const columns: Array<[string, (order: OrderRow) => string]> = [
      ["Date", (o) => (o.created_at ? new Date(o.created_at).toISOString() : "")],
      ["Attendee", (o) => registrationById.get(o.registration_id)?.full_name || ""],
      ["Email", (o) => registrationById.get(o.registration_id)?.email || ""],
      ["Order number", (o) => o.order_number],
      ["Provider", (o) => o.provider],
      ["Quantity", (o) => String(o.quantity ?? 1)],
      ["Status", (o) => o.status],
      ["Currency", (o) => o.currency],
      ["Amount", (o) => Number(o.final_amount).toFixed(2)],
      ["Coupon", (o) => o.coupon_code || ""],
      ["Method", (o) => latestPaymentByOrder.get(o.id)?.method || ""],
      ["Gateway payment id", (o) => latestPaymentByOrder.get(o.id)?.provider_payment_id || ""],
      ["Gateway order id", (o) => o.provider_order_id || ""],
      ["Refund IDs", (o) => (refundsByOrder.get(o.id) ?? []).map((refund) => refund.provider_refund_id || refund.id).join("; ")],
      ["Refund statuses", (o) => (refundsByOrder.get(o.id) ?? []).map((refund) => refund.status).join("; ")],
    ];
    const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const rows = [
      columns.map(([header]) => escape(header)).join(","),
      ...filteredOrders.map((order) => columns.map(([, get]) => escape(get(order))).join(",")),
    ];
    const blob = new Blob([`﻿${rows.join("\r\n")}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `payments-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportRegistrationsCsv = () => {
    const columns: Array<[string, (item: RegistrationIntent) => string]> = [
      ["Full name", (i) => i.full_name],
      ["Email", (i) => i.email],
      ["Phone", (i) => i.phone],
      ["Affiliation", (i) => i.affiliation || ""],
      ["Designation", (i) => i.designation || ""],
      ["Country", (i) => i.country || ""],
      ["Plan", (i) => i.plan_name],
      ["Plan key", (i) => i.plan_key],
      ["Currency", (i) => i.currency],
      ["Amount", (i) => Number(i.amount_usd).toFixed(2)],
      ["Provider", (i) => i.payment_provider],
      ["Payment status", (i) => i.payment_status],
      ["Registration status", (i) => i.status],
      ["Payment reference", (i) => i.payment_reference || ""],
      ["Order id", (i) => i.payment_order_id || ""],
      ["Created", (i) => (i.created_at ? new Date(i.created_at).toISOString() : "")],
      ["Completed", (i) => (i.completed_at ? new Date(i.completed_at).toISOString() : "")],
    ];
    const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const rows = [
      columns.map(([header]) => escape(header)).join(","),
      ...filteredRegistrations.map((item) => columns.map(([, get]) => escape(get(item))).join(",")),
    ];
    const blob = new Blob([`﻿${rows.join("\r\n")}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `registrations-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    fetchData();
    // Poll so newly completed transactions and status changes surface without a
    // manual reload. 25s keeps the admin view close to live without hammering.
    const interval = window.setInterval(() => {
      fetchData();
    }, 25_000);
    return () => window.clearInterval(interval);
  }, [fetchData]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display">Submissions & Attendees</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="registrations" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 max-w-3xl">
            <TabsTrigger value="registrations">Registrations</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
            <TabsTrigger value="abstracts">Abstracts</TabsTrigger>
            <TabsTrigger value="messages">Messages</TabsTrigger>
          </TabsList>

          <TabsContent value="registrations">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative w-full sm:max-w-xs">
                <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search name, email, plan, status…"
                  className="pl-8"
                  value={registrationSearch}
                  onChange={(event) => setRegistrationSearch(event.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" onClick={handleRefresh} disabled={refreshing}>
                  <RefreshCw className={`mr-1 h-3 w-3 ${refreshing ? "animate-spin" : ""}`} /> Refresh
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={exportRegistrationsCsv} disabled={filteredRegistrations.length === 0}>
                  <FileDown className="mr-1 h-3 w-3" /> Export CSV
                </Button>
              </div>
            </div>
            <div className="mb-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-md border border-border p-4">
                <p className="text-sm text-muted-foreground">Successful</p>
                <p className="font-display text-2xl font-bold text-foreground">{registrationCounts.successful}</p>
              </div>
              <div className="rounded-md border border-border p-4">
                <p className="text-sm text-muted-foreground">Failed / Cancelled</p>
                <p className="font-display text-2xl font-bold text-foreground">{registrationCounts.failed}</p>
              </div>
              <div className="rounded-md border border-border p-4">
                <p className="text-sm text-muted-foreground">Processing</p>
                <p className="font-display text-2xl font-bold text-foreground">{registrationCounts.processing}</p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Attendee</TableHead>
                    <TableHead className="hidden md:table-cell">Affiliation</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead className="hidden lg:table-cell">Created</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRegistrations.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        {registrations.length === 0 ? "No registrations yet." : "No registrations match your search."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRegistrations.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="font-medium">{item.full_name}</div>
                          <div className="text-sm text-muted-foreground">{item.email}</div>
                          <div className="text-sm text-muted-foreground">{item.phone}</div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <div>{item.affiliation || "-"}</div>
                          <div className="text-sm text-muted-foreground">{item.country || item.designation || "-"}</div>
                        </TableCell>
                        <TableCell>
                          <div>{item.plan_name}</div>
                          <div className="text-sm text-muted-foreground">{item.plan_key}</div>
                        </TableCell>
                        <TableCell>
                          {item.currency} {Number(item.amount_usd).toFixed(2)}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium capitalize">{item.payment_provider}</div>
                          <Badge variant={getPaymentBadgeVariant(item.payment_status)}>{item.payment_status}</Badge>
                          <div className="mt-1 text-sm text-muted-foreground">{item.status}</div>
                          <div className="text-sm text-muted-foreground">{item.payment_reference || item.payment_session_id || item.payment_order_id || "-"}</div>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">{formatDate(item.created_at)}</TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-2">
                            <Button type="button" size="sm" variant="outline" onClick={() => setSelectedRegistration(item)}>
                              <Eye className="mr-1 h-3 w-3" /> View
                            </Button>
                            {item.payment_status?.toLowerCase() === "paid" && getInternalOrderId(item) ? (
                              <Button type="button" size="sm" variant="outline" onClick={() => {
                                const orderId = getInternalOrderId(item);
                                if (orderId) void downloadReceipt(item.id, orderId);
                              }}>
                                <Download className="mr-1 h-3 w-3" /> Receipt
                              </Button>
                            ) : null}
                            {item.payment_status?.toLowerCase() === "paid" && getInternalOrderId(item) ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="destructive"
                                disabled={refundingId === item.id}
                                onClick={() => refundRegistration(item)}
                              >
                                <RotateCcw className="mr-1 h-3 w-3" /> {refundingId === item.id ? "Refunding…" : "Refund"}
                              </Button>
                            ) : null}
                            <Button
                              type="button"
                              size="sm"
                              variant="destructive"
                              disabled={deletingId === item.id}
                              onClick={() =>
                                requestDelete({
                                  table: "registration_intents",
                                  id: item.id,
                                  title: "Are you sure you want to delete this registration?",
                                  body: `This will permanently remove ${item.full_name || "this registrant"} (${item.email || item.id}) along with its associated orders and payment records.`,
                                })
                              }
                            >
                              <Trash2 className="mr-1 h-3 w-3" /> {deletingId === item.id ? "Deleting…" : "Delete"}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="payments">
            <div className="mb-4 grid gap-3 md:grid-cols-4">
              {providerStatus ? (
                Object.entries(providerStatus).map(([provider, config]) => (
                  <div key={provider} className="rounded-md border border-border p-4">
                    <p className="text-sm uppercase tracking-wide text-muted-foreground">{provider}</p>
                    <p className="mt-2 font-display text-xl font-bold text-foreground">{config.configured ? "Configured" : "Not configured"}</p>
                    <p className="text-sm text-muted-foreground">Mode: {config.mode}</p>
                  </div>
                ))
              ) : (
                <div className="rounded-md border border-border p-4 md:col-span-4">
                  <p className="text-sm text-muted-foreground">Payment provider status is unavailable until the API is reachable.</p>
                </div>
              )}
            </div>
            <div className="overflow-x-auto">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Every payment attempt (one row per order). A single attendee may appear multiple times.
                </p>
                <Button type="button" size="sm" variant="outline" onClick={handleRefresh} disabled={refreshing}>
                  <RefreshCw className={`mr-1 h-3 w-3 ${refreshing ? "animate-spin" : ""}`} /> Refresh
                </Button>
              </div>

              {/* Date / status / text filters for the transaction ledger. */}
              <div className="mb-3 flex flex-col gap-3 rounded-md border border-border p-3 lg:flex-row lg:flex-wrap lg:items-end">
                <div className="flex flex-col gap-1">
                  <label className="text-xs uppercase tracking-wide text-muted-foreground">Date</label>
                  <Select value={datePreset} onValueChange={setDatePreset}>
                    <SelectTrigger className="w-full sm:w-[170px]">
                      <CalendarDays className="mr-1 h-4 w-4 text-muted-foreground" />
                      <SelectValue placeholder="All dates" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All dates</SelectItem>
                      <SelectItem value="today">Today</SelectItem>
                      <SelectItem value="yesterday">Yesterday</SelectItem>
                      <SelectItem value="7d">Last 7 days</SelectItem>
                      <SelectItem value="30d">Last 30 days</SelectItem>
                      <SelectItem value="month">This month</SelectItem>
                      <SelectItem value="custom">Custom range…</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {datePreset === "custom" ? (
                  <>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs uppercase tracking-wide text-muted-foreground">From</label>
                      <Input
                        type="date"
                        className="w-full sm:w-[160px]"
                        value={customFrom}
                        max={customTo || undefined}
                        onChange={(event) => setCustomFrom(event.target.value)}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs uppercase tracking-wide text-muted-foreground">To</label>
                      <Input
                        type="date"
                        className="w-full sm:w-[160px]"
                        value={customTo}
                        min={customFrom || undefined}
                        onChange={(event) => setCustomTo(event.target.value)}
                      />
                    </div>
                  </>
                ) : null}

                <div className="flex flex-col gap-1">
                  <label className="text-xs uppercase tracking-wide text-muted-foreground">Status</label>
                  <Select value={paymentStatusFilter} onValueChange={setPaymentStatusFilter}>
                    <SelectTrigger className="w-full sm:w-[150px]">
                      <SelectValue placeholder="All statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      <SelectItem value="PAID">Paid</SelectItem>
                      <SelectItem value="PENDING">Pending</SelectItem>
                      <SelectItem value="CREATED">Created</SelectItem>
                      <SelectItem value="FAILED">Failed</SelectItem>
                      <SelectItem value="CANCELLED">Cancelled</SelectItem>
                      <SelectItem value="REFUND_PENDING">Refund pending</SelectItem>
                      <SelectItem value="PARTIALLY_REFUNDED">Partially refunded</SelectItem>
                      <SelectItem value="REFUNDED">Refunded</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs uppercase tracking-wide text-muted-foreground">Search</label>
                  <div className="relative w-full sm:w-[240px]">
                    <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="search"
                      placeholder="Name, email, order, payment id…"
                      className="pl-8"
                      value={paymentSearch}
                      onChange={(event) => setPaymentSearch(event.target.value)}
                    />
                  </div>
                </div>

                <div className="flex gap-2 lg:ml-auto">
                  {paymentFiltersActive ? (
                    <Button type="button" size="sm" variant="ghost" onClick={clearPaymentFilters}>
                      <X className="mr-1 h-3 w-3" /> Clear
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={exportPaymentsCsv}
                    disabled={filteredOrders.length === 0}
                  >
                    <FileDown className="mr-1 h-3 w-3" /> Export CSV
                  </Button>
                </div>
              </div>

              {/* Totals for the current filter window. */}
              <div className="mb-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-md border border-border p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Transactions</p>
                  <p className="font-display text-xl font-bold text-foreground">{paymentSummary.count}</p>
                </div>
                <div className="rounded-md border border-border p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Paid</p>
                  <p className="font-display text-xl font-bold text-foreground">{paymentSummary.paidCount}</p>
                </div>
                <div className="rounded-md border border-border p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Collected</p>
                  <p className="font-display text-xl font-bold text-foreground">{paidTotalLabel}</p>
                </div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Attendee</TableHead>
                    <TableHead>Order</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Accommodation</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Gateway reference</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                        {orders.length === 0
                          ? "No payment transactions yet."
                          : "No transactions match the selected filters."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredOrders.map((order) => {
                      const registrant = registrationById.get(order.registration_id);
                      const payment = latestPaymentByOrder.get(order.id);
                      const orderRefunds = refundsByOrder.get(order.id) ?? [];
                      const status = order.status.toUpperCase();
                      const gatewayRef = payment?.provider_payment_id || order.provider_order_id || "-";
                      return (
                        <TableRow key={order.id}>
                          <TableCell className="whitespace-nowrap text-sm">{formatDate(order.created_at)}</TableCell>
                          <TableCell>
                            <div className="font-medium">{registrant?.full_name || "Unknown"}</div>
                            <div className="text-sm text-muted-foreground">{registrant?.email || order.registration_id}</div>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{order.order_number}</TableCell>
                          <TableCell className="capitalize">{order.provider}</TableCell>
                          <TableCell>{order.quantity ?? 1}</TableCell>
                          <TableCell className="whitespace-nowrap">
                            {order.currency} {Number(order.final_amount).toFixed(2)}
                            {payment?.status === "SUCCESS" && payment.gateway_amount != null && payment.gateway_currency ? (
                              <div className="mt-1 text-xs text-muted-foreground">
                                Charged: {payment.gateway_currency} {(Number(payment.gateway_amount) / 100).toFixed(2)}
                              </div>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-sm">
                            {order.accommodation_option_id ? (
                              <>
                                <div className="font-medium">{order.accommodation_name || "Accommodation"}</div>
                                <div className="text-muted-foreground">
                                  {order.accommodation_check_in} – {order.accommodation_check_out} ({order.accommodation_nights} night(s))
                                </div>
                                <div>{order.currency} {Number(order.accommodation_total || 0).toFixed(2)}</div>
                              </>
                            ) : "—"}
                          </TableCell>
                          <TableCell>
                            <Badge variant={getPaymentBadgeVariant(status)}>{status}</Badge>
                            {payment?.method ? <div className="mt-1 text-xs text-muted-foreground">{payment.method}</div> : null}
                            {status === "FAILED" && payment?.error_description ? (
                              <div className="mt-1 max-w-[200px] text-xs text-muted-foreground">{payment.error_description}</div>
                            ) : null}
                            {orderRefunds.map((refund) => (
                              <div key={refund.id} className="mt-1 max-w-[220px] break-all text-xs text-muted-foreground">
                                Refund {refund.status}: {refund.currency} {(Number(refund.amount_minor) / 100).toFixed(2)} ({refund.provider_refund_id || refund.id})
                              </div>
                            ))}
                          </TableCell>
                          <TableCell className="max-w-[180px] break-all font-mono text-xs">{gatewayRef}</TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-2">
                              <Button type="button" size="sm" variant="outline" onClick={() => void viewPaymentAudit(order)}>
                                <Eye className="mr-1 h-3 w-3" /> Audit
                              </Button>
                              {["CREATED", "PENDING", "FAILED"].includes(status) ? (
                                <Button type="button" size="sm" variant="outline" disabled={reconcilingId === order.id} onClick={() => void reconcileOrder(order)}>
                                  <RefreshCw className={`mr-1 h-3 w-3 ${reconcilingId === order.id ? "animate-spin" : ""}`} />
                                  {reconcilingId === order.id ? "Checking…" : "Reconcile"}
                                </Button>
                              ) : null}
                              {["PAID", "REFUND_PENDING", "PARTIALLY_REFUNDED", "REFUNDED"].includes(status) ? (
                                <>
                                  <Button type="button" size="sm" variant="outline" onClick={() => downloadReceipt(order.registration_id, order.id)}>
                                    <Download className="mr-1 h-3 w-3" /> Receipt
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="destructive"
                                    disabled={refundingId === order.id}
                                    onClick={() => refundOrder(order)}
                                  >
                                    <RotateCcw className="mr-1 h-3 w-3" /> {refundingId === order.id ? "Refunding…" : "Refund"}
                                  </Button>
                                </>
                              ) : null}
                              <Button
                                type="button"
                                size="sm"
                                variant="destructive"
                                disabled={deletingId === order.id}
                                onClick={() =>
                                  requestDelete({
                                    table: "orders",
                                    id: order.id,
                                    title: "Are you sure you want to delete this payment record?",
                                    body: `This will permanently remove order ${order.order_number} and its payment attempts. The registrant record will be kept.`,
                                  })
                                }
                              >
                                <Trash2 className="mr-1 h-3 w-3" /> {deletingId === order.id ? "Deleting…" : "Delete"}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="abstracts">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Author</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead className="hidden md:table-cell">Type</TableHead>
                    <TableHead className="hidden md:table-cell">Assets</TableHead>
                    <TableHead>Review</TableHead>
                    <TableHead className="hidden lg:table-cell">Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {abstracts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        No abstract submissions yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    abstracts.map((item) => {
                      const storedFiles = getStoredFiles(item.file_paths);

                      return (
                        <TableRow key={item.id}>
                          <TableCell className="min-w-[220px] align-top">
                            <div className="font-medium">{item.full_name || "-"}</div>
                            <div className="text-sm text-muted-foreground">{item.email || "-"}</div>
                            <div className="text-sm text-muted-foreground">{item.phone || "-"}</div>
                            <div className="text-sm text-muted-foreground">{item.affiliation || "-"}</div>
                            <div className="text-sm text-muted-foreground">{item.country || "-"}</div>
                          </TableCell>
                          <TableCell className="min-w-[280px] align-top">
                            <div className="text-sm text-teal">{item.session || "Session not recorded"}</div>
                            <div className="font-medium">{item.abstract_title || "-"}</div>
                            <div className="mt-1 text-sm text-muted-foreground">{item.keywords || "-"}</div>
                            <div className="mt-2 max-w-xl whitespace-pre-wrap text-sm text-muted-foreground">
                              {item.abstract_text || item.supporting_text || "-"}
                            </div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell align-top">
                            <div>{item.presentation_type || "-"}</div>
                            <Badge className="mt-2" variant="secondary">{item.status || "submitted"}</Badge>
                          </TableCell>
                          <TableCell className="hidden md:table-cell min-w-[240px] align-top">
                            <div className="text-sm text-muted-foreground">
                              {[
                                item.website_url ? "Website" : null,
                                item.drive_url ? "Drive" : null,
                                item.supporting_text ? "Text" : null,
                                item.voice_file_name ? "Voice" : null,
                                storedFiles.length > 0 ? "Files" : null,
                              ]
                                .filter(Boolean)
                                .join(", ") || "-"}
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {item.website_url ? (
                                <Button type="button" size="sm" variant="outline" onClick={() => openExternalUrl(item.website_url || "")}>
                                  <ExternalLink className="mr-1 h-3 w-3" />
                                  Website
                                </Button>
                              ) : null}
                              {item.drive_url ? (
                                <Button type="button" size="sm" variant="outline" onClick={() => openExternalUrl(item.drive_url || "")}>
                                  <ExternalLink className="mr-1 h-3 w-3" />
                                  Drive
                                </Button>
                              ) : null}
                              {storedFiles.map((file) => (
                                <Button key={file.path} type="button" size="sm" variant="outline" onClick={() => openStoredFile(file.path)}>
                                  <Download className="mr-1 h-3 w-3" />
                                  {file.name}
                                </Button>
                              ))}
                              {item.voice_file_path ? (
                                <Button type="button" size="sm" variant="outline" onClick={() => openStoredFile(item.voice_file_path || "")}>
                                  <Download className="mr-1 h-3 w-3" />
                                  {item.voice_file_name || "Voice"}
                                </Button>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell className="min-w-[180px] align-top">
                            <div className="flex flex-col gap-2 sm:flex-row">
                              <Button
                                type="button"
                                size="sm"
                                disabled={updatingAbstractId === item.id || item.status === "approved"}
                                onClick={() => updateAbstractStatus(item.id, "approved")}
                              >
                                {updatingAbstractId === item.id ? "Saving..." : "Approve"}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="destructive"
                                disabled={updatingAbstractId === item.id || item.status === "rejected"}
                                onClick={() => updateAbstractStatus(item.id, "rejected")}
                              >
                                Reject
                              </Button>
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="mt-2"
                              disabled={deletingId === item.id}
                              onClick={() =>
                                requestDelete({
                                  table: "abstract_submissions",
                                  id: item.id,
                                  title: "Are you sure you want to delete this abstract?",
                                  body: `This will permanently remove the abstract "${item.abstract_title || item.id}" and its uploaded files.`,
                                })
                              }
                            >
                              <Trash2 className="mr-1 h-3 w-3" /> {deletingId === item.id ? "Deleting…" : "Delete"}
                            </Button>
                          </TableCell>
                          <TableCell className="hidden lg:table-cell align-top">{formatDate(item.created_at)}</TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="messages">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sender</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead className="hidden md:table-cell">Message</TableHead>
                    <TableHead className="hidden lg:table-cell">Created</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {messages.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        No contact messages yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    messages.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="font-medium">{item.name}</div>
                          <div className="text-sm text-muted-foreground">{item.email}</div>
                        </TableCell>
                        <TableCell>{item.subject}</TableCell>
                        <TableCell className="hidden md:table-cell max-w-[380px] truncate">{item.message}</TableCell>
                        <TableCell className="hidden lg:table-cell">{formatDate(item.created_at)}</TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={deletingId === item.id}
                            onClick={() =>
                              requestDelete({
                                table: "contact_messages",
                                id: item.id,
                                title: "Are you sure you want to delete this message?",
                                body: `This will permanently remove the message from ${item.name || item.email || item.id}.`,
                              })
                            }
                          >
                            <Trash2 className="mr-1 h-3 w-3" /> {deletingId === item.id ? "Deleting…" : "Delete"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>

        <Dialog open={Boolean(auditOrder)} onOpenChange={(open) => (open ? null : setAuditOrder(null))}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="font-display">Payment audit</DialogTitle>
              <DialogDescription>{auditOrder ? `Order ${auditOrder.order_number}` : "Order history"}</DialogDescription>
            </DialogHeader>
            {auditLoading ? <p className="text-sm text-muted-foreground">Loading audit history…</p> : null}
            {auditError ? <p className="text-sm text-destructive">{auditError}</p> : null}
            {!auditLoading && !auditError && auditRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No audit events recorded.</p>
            ) : null}
            <div className="max-h-[55vh] space-y-3 overflow-y-auto">
              {auditRows.map((entry) => (
                <div key={entry.id} className="border-b border-border pb-3 last:border-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">{entry.action.replaceAll("_", " ")}</p>
                    <time className="text-xs text-muted-foreground">{formatDate(entry.created_at)}</time>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {entry.previous_status || "-"} → {entry.new_status || "-"} · {entry.provider_reference || "No provider reference"}
                  </p>
                  {entry.amount_minor != null && entry.currency ? (
                    <p className="mt-1 text-xs text-muted-foreground">{entry.currency} {(Number(entry.amount_minor) / 100).toFixed(2)} · Actor {entry.actor_user_id || "system"}</p>
                  ) : <p className="mt-1 text-xs text-muted-foreground">Actor {entry.actor_user_id || "system"}</p>}
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={Boolean(selectedRegistration)} onOpenChange={(open) => (open ? null : setSelectedRegistration(null))}>
          <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
            {selectedRegistration ? (
              <>
                <DialogHeader>
                  <DialogTitle className="font-display">{selectedRegistration.full_name}</DialogTitle>
                  <DialogDescription>Full registration details</DialogDescription>
                </DialogHeader>
                <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                  {[
                    ["Full name", selectedRegistration.full_name],
                    ["Email", selectedRegistration.email],
                    ["Phone", selectedRegistration.phone],
                    ["Affiliation", selectedRegistration.affiliation],
                    ["Designation", selectedRegistration.designation],
                    ["Country", selectedRegistration.country],
                    ["Plan", selectedRegistration.plan_name],
                    ["Plan key", selectedRegistration.plan_key],
                    ["Amount", `${selectedRegistration.currency} ${Number(selectedRegistration.amount_usd).toFixed(2)}`],
                    ["Payment provider", selectedRegistration.payment_provider],
                    ["Payment status", selectedRegistration.payment_status],
                    ["Registration status", selectedRegistration.status],
                    ["Payment reference", selectedRegistration.payment_reference],
                    ["Order id", selectedRegistration.payment_order_id],
                    ["Session id", selectedRegistration.payment_session_id],
                    ["Created", formatDate(selectedRegistration.created_at)],
                    ["Completed", formatDate(selectedRegistration.completed_at)],
                    ["Cancelled", formatDate(selectedRegistration.cancelled_at)],
                    ["Redirected", formatDate(selectedRegistration.redirected_at)],
                    ["Updated", formatDate(selectedRegistration.updated_at)],
                  ].map(([label, value]) => (
                    <div key={label as string}>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
                      <p className="break-words text-sm font-medium text-foreground">{value || "-"}</p>
                    </div>
                  ))}
                </div>
                {selectedRegistration.notes ? (
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Notes</p>
                    <p className="whitespace-pre-wrap break-words text-sm text-foreground">{selectedRegistration.notes}</p>
                  </div>
                ) : null}
                {selectedRegistration.payment_status?.toLowerCase() === "paid" ? (
                  <div className="flex flex-wrap gap-2 pt-2">
                    {getInternalOrderId(selectedRegistration) ? (
                      <Button type="button" size="sm" variant="outline" onClick={() => {
                        const orderId = getInternalOrderId(selectedRegistration);
                        if (orderId) void downloadReceipt(selectedRegistration.id, orderId);
                      }}>
                        <Download className="mr-1 h-4 w-4" /> Download Receipt
                      </Button>
                    ) : null}
                    {getInternalOrderId(selectedRegistration) ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        disabled={refundingId === selectedRegistration.id}
                        onClick={() => refundRegistration(selectedRegistration)}
                      >
                        <RotateCcw className="mr-1 h-4 w-4" />
                        {refundingId === selectedRegistration.id ? "Refunding…" : "Refund payment"}
                      </Button>
                    ) : null}
                  </div>
                ) : (
                  <p className="pt-2 text-sm text-muted-foreground">The receipt/invoice becomes available once the payment is confirmed.</p>
                )}
                <div className="flex flex-wrap gap-2 border-t pt-3">
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    disabled={deletingId === selectedRegistration.id}
                    onClick={() =>
                      requestDelete({
                        table: "registration_intents",
                        id: selectedRegistration.id,
                        title: "Are you sure you want to delete this registration?",
                        body: `This will permanently remove ${selectedRegistration.full_name || "this registrant"} (${selectedRegistration.email || selectedRegistration.id}) along with its associated orders and payment records.`,
                      })
                    }
                  >
                    <Trash2 className="mr-1 h-4 w-4" />
                    {deletingId === selectedRegistration.id ? "Deleting…" : "Delete registration"}
                  </Button>
                </div>
              </>
            ) : null}
          </DialogContent>
        </Dialog>

        {/* Two-step delete confirmation. Step 1 warns and offers Cancel/Continue;
            step 2 requires an explicit final Cancel/Delete Permanently. The DELETE
            request only fires from step 2, and buttons disable while it runs. */}
        <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => (open ? null : cancelDelete())}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="font-display">
                {deleteStep === 1 ? deleteTarget?.title ?? "Delete record?" : "Final confirmation"}
              </DialogTitle>
              <DialogDescription>
                {deleteStep === 1
                  ? deleteTarget?.body
                  : "This record will be permanently deleted. This action cannot be undone. Do you want to proceed?"}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button type="button" variant="outline" onClick={cancelDelete} disabled={deletingId !== null}>
                Cancel
              </Button>
              <Button type="button" variant="destructive" onClick={confirmDelete} disabled={deletingId !== null}>
                {deleteStep === 1 ? "Continue" : deletingId !== null ? "Deleting…" : "Delete Permanently"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};

export default AdminSubmissions;
