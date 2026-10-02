"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "./ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/integrations/api/client";
import type { AccommodationOption } from "@/integrations/api/types";
import {
  createPaymentOrder,
  cancelPaymentOrder,
  getPaymentStatus,
  openRazorpayCheckout,
  quoteRegistration,
  verifyRazorpayPayment,
} from "@/integrations/api/payments";
import { type ImportantDateItem, type PricingRow, toLocalDate, useConferenceSettings } from "@/lib/conferenceSettings";
import CaptchaVerification from "@/components/CaptchaVerification";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const SERVICE_CHARGE_RATE = 0.05;

type PaymentProvider = "stripe" | "paypal" | "razorpay";

// What the buyer picks in the UI. "card" is a Razorpay checkout limited to
// credit/debit cards; every other choice maps straight to its own gateway.
type PaymentChoice = "stripe" | "paypal" | "razorpay" | "card";

const CHOICE_TO_PROVIDER: Record<PaymentChoice, PaymentProvider> = {
  stripe: "stripe",
  paypal: "paypal",
  razorpay: "razorpay",
  card: "razorpay",
};

// Button state machine (#1, #2): each phase drives the label and disabled state
// so the buyer cannot double-submit or lose track of where a payment is.
type PaymentPhase = "idle" | "creating" | "opening" | "processing" | "redirecting";

const PHASE_LABELS: Record<PaymentPhase, string> = {
  idle: "proceed to register",
  creating: "Creating order…",
  opening: "Opening checkout…",
  processing: "Verifying payment…",
  redirecting: "Redirecting…",
};

type CategoryKey =
  | "pre-speaker"
  | "pre-poster"
  | "pre-student"
  | "pre-delegate"
  | "pre-virtual"
  | "early-speaker"
  | "early-poster"
  | "early-student"
  | "early-delegate"
  | "early-virtual"
  | "mid-speaker"
  | "mid-poster"
  | "mid-student"
  | "mid-delegate"
  | "onspot-speaker"
  | "onspot-poster"
  | "onspot-student"
  | "onspot-delegate";

type RegistrationCategory = {
  key: CategoryKey;
  label: string;
  price: number;
};

type RegistrationGroup = {
  title: string;
  date: string;
  startDate?: Date;
  endDate: Date;
  categories: RegistrationCategory[];
};

const noAvailableCategories: RegistrationCategory[] = [];

type FormValues = {
  title: string;
  name: string;
  email: string;
  phone: string;
  altEmail: string;
  whatsApp: string;
  organization: string;
  country: string;
};

type AppliedCoupon = {
  code: string;
  discountPercent?: number | null;
  discountAmount?: number | null;
};

const titleOptions = ["Mr.", "Ms.", "Mrs.", "Dr.", "Prof."];

const countryOptions = [
  "Australia",
  "Brazil",
  "Canada",
  "China",
  "France",
  "Germany",
  "India",
  "Italy",
  "Japan",
  "Netherlands",
  "Singapore",
  "South Africa",
  "Spain",
  "United Arab Emirates",
  "United Kingdom",
  "United States",
  "Other",
];

const initialForm: FormValues = {
  title: "",
  name: "",
  email: "",
  phone: "",
  altEmail: "",
  whatsApp: "",
  organization: "",
  country: "",
};

const formatUsd = (value: number) => `$${value.toFixed(value % 1 === 0 ? 0 : 2)}`;

const getToday = () => {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), today.getDate());
};

const isGroupAvailable = (group: RegistrationGroup, today: Date) => {
  const startsOn = group.startDate ?? new Date(0);
  return today >= startsOn && today <= group.endDate;
};

const labelForPricingRow = (row: PricingRow) =>
  row.id === "speaker"
    ? "Speaker Presentation"
    : row.id === "poster"
      ? "Poster Presentation"
      : row.id === "student"
        ? "Student Delegate (Listener)"
        : row.category;

const buildRegistrationGroups = (pricingRows: PricingRow[], importantDates: ImportantDateItem[]): RegistrationGroup[] => {
  const dateById = new Map(importantDates.map((date) => [date.id, date]));
  const groupConfigs = [
    { id: "early", prefix: "early", priceKey: "earlyBird" as const, fallbackTitle: "Early Bird Registration" },
    { id: "mid", prefix: "mid", priceKey: "midterm" as const, fallbackTitle: "Mid Term Registration" },
    { id: "onspot", prefix: "onspot", priceKey: "onSpot" as const, fallbackTitle: "On-spot Registration" },
  ];

  return groupConfigs.map((config) => {
    const date = dateById.get(config.id);

    return {
      title: date?.title || config.fallbackTitle,
      date: date?.date || "",
      startDate: toLocalDate(date?.startDate),
      endDate: toLocalDate(date?.endDate) ?? new Date(8640000000000000),
      categories: pricingRows.map((row) => ({
        key: `${config.prefix}-${row.id}` as CategoryKey,
        label: labelForPricingRow(row),
        price: row[config.priceKey],
      })),
    };
  });
};

const PricingSection = () => {
  const { toast } = useToast();
  const { importantDates, pricingRows } = useConferenceSettings();
  const [formValues, setFormValues] = useState<FormValues>(initialForm);
  const [selectedCategoryKey, setSelectedCategoryKey] = useState<CategoryKey>("early-speaker");
  const [participants, setParticipants] = useState(1);
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);
  const [accommodationOptions, setAccommodationOptions] = useState<AccommodationOption[]>([]);
  const [accommodationOptionId, setAccommodationOptionId] = useState("");
  const [accommodationCheckIn, setAccommodationCheckIn] = useState("");
  const [accommodationCheckOut, setAccommodationCheckOut] = useState("");
  const [accommodationQuote, setAccommodationQuote] = useState<Awaited<ReturnType<typeof quoteRegistration>> | null>(null);
  const [accommodationQuoteError, setAccommodationQuoteError] = useState<string | null>(null);
  const [accommodationQuoteLoading, setAccommodationQuoteLoading] = useState(false);
  const [paymentChoice, setPaymentChoice] = useState<PaymentChoice>("razorpay");
  const paymentProvider = CHOICE_TO_PROVIDER[paymentChoice];
  const preferCard = paymentChoice === "card";
  const [paymentPhase, setPaymentPhase] = useState<PaymentPhase>("idle");
  const isSubmitting = paymentPhase !== "idle";
  const [isCaptchaVerified, setIsCaptchaVerified] = useState(false);
  const [hasAcceptedTerms, setHasAcceptedTerms] = useState(false);
  const [isTermsDialogOpen, setIsTermsDialogOpen] = useState(false);
  const [captchaResetKey, setCaptchaResetKey] = useState(0);
  const [countrySearch, setCountrySearch] = useState("");
  const [otherCountry, setOtherCountry] = useState("");
  const filteredCountries = countryOptions.filter((country) =>
    country.toLowerCase().includes(countrySearch.trim().toLowerCase()),
  );

  const today = useMemo(getToday, []);
  const registrationGroups = useMemo(
    () => buildRegistrationGroups(pricingRows, importantDates),
    [importantDates, pricingRows],
  );
  const activeGroup = registrationGroups.find((group) => isGroupAvailable(group, today));
  const availableCategories = activeGroup?.categories ?? noAvailableCategories;
  const allCategories = registrationGroups.flatMap((group) => group.categories);
  const selectedCategory = allCategories.find((category) => category.key === selectedCategoryKey) ?? availableCategories[0] ?? allCategories[0];
  const registrationPrice = selectedCategory.price;
  const subtotalPrice = registrationPrice * participants;
  const discount = appliedCoupon
    ? appliedCoupon.discountAmount && appliedCoupon.discountAmount > 0
      ? Math.min(appliedCoupon.discountAmount, subtotalPrice)
      : appliedCoupon.discountPercent && appliedCoupon.discountPercent > 0
        ? Math.min((subtotalPrice * appliedCoupon.discountPercent) / 100, subtotalPrice)
        : 0
    : 0;
  const totalRegistrationPrice = Math.max(subtotalPrice - discount, 0);
  const serviceCharge = totalRegistrationPrice * SERVICE_CHARGE_RATE;
  const totalPrice = totalRegistrationPrice + serviceCharge;
  const selectedAccommodation = accommodationOptions.find((option) => option.id === accommodationOptionId);
  const accommodationNights = accommodationCheckIn && accommodationCheckOut
    ? Math.max(0, (Date.parse(`${accommodationCheckOut}T00:00:00Z`) - Date.parse(`${accommodationCheckIn}T00:00:00Z`)) / 86_400_000)
    : 0;
  const accommodationTotal = accommodationQuote?.accommodation?.total ?? 0;

  useEffect(() => {
    let active = true;
    void apiClient
      .from("accommodation_options")
      .select("*")
      .eq("is_active", true)
      .order("name", { ascending: true })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          toast({ title: "Accommodation unavailable", description: error.message, variant: "destructive" });
          return;
        }
        setAccommodationOptions(data ?? []);
      });
    return () => {
      active = false;
    };
  }, [toast]);

  useEffect(() => {
    setAccommodationQuote(null);
    setAccommodationQuoteError(null);
    setAccommodationQuoteLoading(false);
    if (!accommodationOptionId || !accommodationCheckIn || !accommodationCheckOut || accommodationNights < 1) return;

    let active = true;
    setAccommodationQuoteLoading(true);
    void quoteRegistration({
      planKey: selectedCategoryKey,
      couponCode: appliedCoupon?.code || null,
      quantity: participants,
      accommodationOptionId,
      accommodationCheckIn,
      accommodationCheckOut,
    }).then((quote) => {
      if (active) setAccommodationQuote(quote);
    }).catch((error: unknown) => {
      if (active) setAccommodationQuoteError(error instanceof Error ? error.message : "Could not quote accommodation");
    }).finally(() => {
      if (active) setAccommodationQuoteLoading(false);
    });
    return () => {
      active = false;
    };
  }, [accommodationOptionId, accommodationCheckIn, accommodationCheckOut, accommodationNights, selectedCategoryKey, appliedCoupon?.code, participants]);

  useEffect(() => {
    if (availableCategories.length && !availableCategories.some((category) => category.key === selectedCategoryKey)) {
      setSelectedCategoryKey(availableCategories[0].key);
    }
  }, [availableCategories, selectedCategoryKey]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const couponFromUrl = params.get("coupon")?.trim();
    if (!couponFromUrl) return;

    setCouponCode(couponFromUrl);
    void validateCoupon(couponFromUrl);
  }, []);

  const updateFormValue = (field: keyof FormValues, value: string) => {
    setFormValues((current) => ({ ...current, [field]: value }));
  };

  const validateCoupon = async (code: string) => {
    const trimmedCode = code.trim();

    if (!trimmedCode) {
      setAppliedCoupon(null);
      toast({
        title: "Enter coupon code",
        description: "Please enter a coupon code before applying.",
        variant: "destructive",
      });
      return null;
    }

    const { data, error } = await (apiClient as any).rpc("validate_registration_coupon", {
      p_code: trimmedCode,
      p_email: "",
      p_amount_usd: subtotalPrice,
    });

    const result = data;

    if (error || !result || !result.valid || Number(result.discount_amount ?? 0) <= 0) {
      setAppliedCoupon(null);
      toast({
        title: "Coupon code wrong",
        description: error?.message || result?.message || "Please enter a valid coupon code",
        variant: "destructive",
      });
      return null;
    }

    setAppliedCoupon({
      code: result.code ?? result.coupon?.code,
      discountPercent: result.discount_percent ?? null,
      discountAmount: result.discount_percent ? null : result.discount_amount ?? null,
    });

    const discountLabel = result.discount_amount
      ? formatUsd(result.discount_amount)
      : result.discount_percent
        ? `${result.discount_percent}%`
        : "discount";

    toast({
      title: "Coupon applied",
      description: `${discountLabel} applied to your registration amount.`,
    });

    return result;
  };

  const handleApplyCoupon = () => {
    if (!couponCode.trim()) {
      setAppliedCoupon(null);
      return;
    }

    void validateCoupon(couponCode);
  };

  const handleReset = () => {
    setFormValues(initialForm);
    setOtherCountry("");
    setSelectedCategoryKey(availableCategories[0]?.key ?? "early-speaker");
    setParticipants(1);
    setCouponCode("");
    setAppliedCoupon(null);
    setAccommodationOptionId("");
    setAccommodationCheckIn("");
    setAccommodationCheckOut("");
    setAccommodationQuote(null);
    setIsCaptchaVerified(false);
    setHasAcceptedTerms(false);
    setCaptchaResetKey((current) => current + 1);
  };

  const handleProceed = async () => {
    const requiredFields: Array<keyof FormValues> = ["title", "name", "email", "organization", "country"];
    const hasMissingField = requiredFields.some((field) => !formValues[field].trim());
    const hasMissingOtherCountry = formValues.country === "Other" && !otherCountry.trim();

    if (!availableCategories.some((category) => category.key === selectedCategoryKey)) {
      toast({
        title: "Registration period is not available",
        description: "Please select an option from the currently open registration period.",
        variant: "destructive",
      });
      return;
    }

    if (hasMissingField || hasMissingOtherCountry) {
      toast({
        title: "Complete required fields",
        description: "Title, Name, Email, Organization, and Country are required.",
        variant: "destructive",
      });
      return;
    }

    if (!formValues.email.includes("@")) {
      toast({
        title: "Enter a valid email",
        description: "Email must include @.",
        variant: "destructive",
      });
      return;
    }

    if (!isCaptchaVerified) {
      toast({
        title: "Captcha required",
        description: "Please complete captcha verification before proceeding to register.",
        variant: "destructive",
      });
      return;
    }

    if (!hasAcceptedTerms) {
      toast({
        title: "Terms acceptance required",
        description: "Please accept the Terms & Conditions before proceeding to register.",
        variant: "destructive",
      });
      return;
    }

    setPaymentPhase("creating");

    let effectiveCoupon = appliedCoupon;

    if (couponCode.trim()) {
      const couponResult = await validateCoupon(couponCode);

      if (!couponResult) {
        setPaymentPhase("idle");
        return;
      }

      effectiveCoupon = {
        code: couponResult.code,
        discountPercent: couponResult.discount_percent ?? null,
        discountAmount: couponResult.discount_percent ? null : couponResult.discount_amount ?? null,
      };
    } else {
      effectiveCoupon = null;
      setAppliedCoupon(null);
    }

    let checkoutQuote;
    try {
      checkoutQuote = await quoteRegistration({
        planKey: selectedCategoryKey,
        couponCode: effectiveCoupon?.code || null,
        quantity: participants,
        accommodationOptionId: accommodationOptionId || null,
        accommodationCheckIn: accommodationOptionId ? accommodationCheckIn : null,
        accommodationCheckOut: accommodationOptionId ? accommodationCheckOut : null,
      });
    } catch (quoteError) {
      setPaymentPhase("idle");
      toast({
        title: "Could not confirm registration price",
        description: quoteError instanceof Error ? quoteError.message : "Please review the accommodation and try again.",
        variant: "destructive",
      });
      return;
    }

    const effectiveDiscount = effectiveCoupon
      ? effectiveCoupon.discountAmount && effectiveCoupon.discountAmount > 0
        ? Math.min(effectiveCoupon.discountAmount, subtotalPrice)
        : effectiveCoupon.discountPercent && effectiveCoupon.discountPercent > 0
          ? Math.min((subtotalPrice * effectiveCoupon.discountPercent) / 100, subtotalPrice)
          : 0
      : 0;
    const effectiveRegistrationTotal = Math.max(subtotalPrice - effectiveDiscount, 0);
    const effectiveServiceCharge = effectiveRegistrationTotal * SERVICE_CHARGE_RATE;
    const discountDescription = effectiveCoupon
      ? effectiveCoupon.discountAmount && effectiveCoupon.discountAmount > 0
        ? formatUsd(effectiveCoupon.discountAmount)
        : effectiveCoupon.discountPercent
          ? `${effectiveCoupon.discountPercent}%`
          : formatUsd(effectiveDiscount)
      : "0";
    const notes = [
      formValues.altEmail ? `Alt Email: ${formValues.altEmail}` : "",
      formValues.whatsApp ? `WhatsApp Number: ${formValues.whatsApp}` : "",
      `Participants: ${participants}`,
      `Discount: ${discountDescription}`,
      `Service Charge: ${formatUsd(effectiveServiceCharge)}`,
      selectedAccommodation && accommodationCheckIn && accommodationCheckOut
        ? `Accommodation: ${selectedAccommodation.name} (${accommodationCheckIn} to ${accommodationCheckOut}, ${accommodationNights} nights) - ${formatUsd(checkoutQuote.accommodation?.total ?? 0)}`
        : "",
      `Total Price: ${formatUsd(checkoutQuote.amount.final)}`,
      couponCode.trim() ? `Coupon: ${couponCode.trim()}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const { data, error } = await (apiClient as any)
      .from("registration_intents")
      .insert({
        full_name: [formValues.title, formValues.name].filter(Boolean).join(" "),
        email: formValues.email.trim(),
        phone: formValues.phone.trim() || formValues.whatsApp.trim() || "Not provided",
        affiliation: formValues.organization.trim(),
        country: formValues.country === "Other" ? otherCountry.trim() : formValues.country,
        coupon_code: effectiveCoupon?.code || null,
        designation: selectedCategory.label,
        notes,
        plan_key: selectedCategory.key,
        plan_name: selectedCategory.label,
        quantity: participants,
        payment_provider: paymentProvider,
        amount_usd: checkoutQuote.amount.final,
        currency: "USD",
        payment_status: "pending",
        status: "initiated",
        accommodation_option_id: accommodationOptionId || null,
        accommodation_check_in: accommodationOptionId ? accommodationCheckIn : null,
        accommodation_check_out: accommodationOptionId ? accommodationCheckOut : null,
      })
      .select("id")
      .single();

    if (error || !data) {
      setPaymentPhase("idle");
      toast({
        title: "Could not start registration",
        description: error?.message || "Unknown error",
        variant: "destructive",
      });
      return;
    }

    // Ask the backend to create the authoritative order + gateway order. The
    // amount is recomputed server-side; nothing here is trusted for pricing. (#3)
    // NOTE: every checkout uses the id from the fresh insert above — we never
    // cache/reuse a registrationId, so a receipt always reflects the details
    // entered for this order.
    let order;
    try {
      order = await createPaymentOrder(data.id, paymentProvider);
    } catch (orderError) {
      setPaymentPhase("idle");
      toast({
        title: "Could not start payment",
        description: orderError instanceof Error ? orderError.message : "Please try again.",
        variant: "destructive",
      });
      return;
    }

    // Hosted checkouts (Stripe / PayPal): hand off to the provider-hosted page.
    if (paymentProvider !== "razorpay") {
      if (!order.checkoutUrl) {
        setPaymentPhase("idle");
        toast({ title: "Checkout unavailable", description: "The payment page could not be opened.", variant: "destructive" });
        return;
      }
      setPaymentPhase("redirecting");
      toast({ title: "Redirecting", description: `Opening ${paymentProvider} checkout.` });
      window.location.href = order.checkoutUrl;
      return;
    }

    // Razorpay: open the modal in-page, then verify the signed result server-side.
    setPaymentPhase("opening");
    try {
      const result = await openRazorpayCheckout(order, { preferCard });

      if (result.outcome === "dismissed") {
        await cancelPaymentOrder(order.accessToken).catch(() => null);
        setPaymentPhase("idle");
        toast({ title: "Payment cancelled", description: "You closed the checkout before completing payment." });
        return;
      }

      if (result.outcome === "failed") {
        setPaymentPhase("idle");
        toast({ title: "Payment failed", description: result.message, variant: "destructive" });
        return;
      }

      setPaymentPhase("processing");
      await verifyRazorpayPayment(result.response);

      // Confirm against DB-truth status before celebrating (#21, #35).
      const status = await getPaymentStatus(order.accessToken).catch(() => null);
      if (status && !status.paid) {
        setPaymentPhase("idle");
        toast({ title: "Payment not confirmed", description: "We could not confirm your payment. Please contact support.", variant: "destructive" });
        return;
      }

      setPaymentPhase("redirecting");
      window.location.href = `/registration/success?provider=razorpay&order=${encodeURIComponent(order.accessToken)}`;
    } catch (verifyError) {
      setPaymentPhase("idle");
      toast({
        title: "Payment verification failed",
        description: verifyError instanceof Error ? verifyError.message : "Please contact support if you were charged.",
        variant: "destructive",
      });
    }
  };

  return (
    <section className="bg-gradient-to-b from-background via-teal/5 to-background py-12">
      <div className="container mx-auto max-w-6xl px-4">
        <div className="space-y-9">
          <div className="overflow-hidden rounded-md border border-border bg-card shadow-lg shadow-black/5">
            <div className="border-b border-border bg-gradient-to-r from-teal/20 via-gold/10 to-transparent px-5 py-4 md:px-6">
              <p className="text-sm font-extrabold uppercase tracking-wider text-teal">Participant Details</p>
              <h2 className="mt-1 font-display text-3xl font-bold text-card-foreground">Registration</h2>
            </div>

            <div className="grid gap-4 p-5 md:grid-cols-2 md:p-6">
              <div>
                <label className="mb-2 block text-sm font-semibold text-foreground">Title*</label>
                <Select value={formValues.title} onValueChange={(value) => updateFormValue("title", value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {titleOptions.map((title) => (
                      <SelectItem key={title} value={title}>
                        {title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-foreground">Name*</label>
                <Input placeholder="Name" value={formValues.name} onChange={(event) => updateFormValue("name", event.target.value)} />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-foreground">Email*</label>
                <Input type="email" placeholder="Email" value={formValues.email} onChange={(event) => updateFormValue("email", event.target.value)} />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-foreground">Phone</label>
                <Input placeholder="Phone" value={formValues.phone} onChange={(event) => updateFormValue("phone", event.target.value)} />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-foreground">Alt Email</label>
                <Input type="email" placeholder="Email" value={formValues.altEmail} onChange={(event) => updateFormValue("altEmail", event.target.value)} />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-foreground">WhatsApp Number</label>
                <Input placeholder="WhatsApp Number" value={formValues.whatsApp} onChange={(event) => updateFormValue("whatsApp", event.target.value)} />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-foreground">Organization*</label>
                <Input placeholder="Organization" value={formValues.organization} onChange={(event) => updateFormValue("organization", event.target.value)} />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-foreground">Country*</label>
                <Select
                  value={formValues.country}
                  onValueChange={(value) => {
                    updateFormValue("country", value);
                    setCountrySearch("");
                    if (value !== "Other") setOtherCountry("");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <div className="sticky top-0 z-10 bg-popover p-2">
                      <Input
                        autoFocus
                        value={countrySearch}
                        onChange={(event) => setCountrySearch(event.target.value)}
                        onKeyDown={(event) => event.stopPropagation()}
                        placeholder="Search country"
                        aria-label="Search country"
                      />
                    </div>
                    {filteredCountries.map((country) => (
                      <SelectItem key={country} value={country}>
                        {country}
                      </SelectItem>
                    ))}
                    {filteredCountries.length === 0 && (
                      <p className="px-2 py-3 text-sm text-muted-foreground">No countries found.</p>
                    )}
                  </SelectContent>
                </Select>
                {formValues.country === "Other" && (
                  <Input
                    className="mt-2"
                    value={otherCountry}
                    onChange={(event) => setOtherCountry(event.target.value)}
                    placeholder="Enter country name"
                    aria-label="Enter country name"
                    required
                  />
                )}
              </div>
            </div>
          </div>

          <div className="rounded-md border border-border bg-card p-5 md:p-6">
            <h3 className="font-display text-xl font-bold text-card-foreground">Accommodation (optional)</h3>
            <p className="mt-1 text-sm text-muted-foreground">Choose one room for this registration. The stay is charged per night and added to the same payment.</p>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <div>
                <label className="mb-2 block text-sm font-semibold text-foreground">Accommodation option</label>
                <Select
                  value={accommodationOptionId || "none"}
                  onValueChange={(value) => {
                    setAccommodationOptionId(value === "none" ? "" : value);
                    setAccommodationQuote(null);
                    setAccommodationCheckIn("");
                    setAccommodationCheckOut("");
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="No accommodation" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No accommodation</SelectItem>
                    {accommodationOptions.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.name} — {formatUsd(Number(option.price_per_night))} / night
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedAccommodation?.description && <p className="mt-1 text-xs text-muted-foreground">{selectedAccommodation.description}</p>}
              </div>
              {selectedAccommodation && (
                <>
                  <div>
                    <label htmlFor="accommodation-check-in" className="mb-2 block text-sm font-semibold text-foreground">Check-in</label>
                    <Input
                      id="accommodation-check-in"
                      type="date"
                      min={selectedAccommodation.available_from || undefined}
                      max={selectedAccommodation.available_until || undefined}
                      value={accommodationCheckIn}
                      onChange={(event) => setAccommodationCheckIn(event.target.value)}
                    />
                  </div>
                  <div>
                    <label htmlFor="accommodation-check-out" className="mb-2 block text-sm font-semibold text-foreground">Check-out</label>
                    <Input
                      id="accommodation-check-out"
                      type="date"
                      min={accommodationCheckIn || selectedAccommodation.available_from || undefined}
                      max={selectedAccommodation.available_until || undefined}
                      value={accommodationCheckOut}
                      onChange={(event) => setAccommodationCheckOut(event.target.value)}
                    />
                  </div>
                </>
              )}
            </div>
            {selectedAccommodation && (
              <div className="mt-3 text-sm" aria-live="polite">
                {accommodationQuoteLoading && <p className="text-muted-foreground">Checking accommodation price and dates…</p>}
                {accommodationQuoteError && <p className="text-destructive">{accommodationQuoteError}</p>}
                {!accommodationQuoteLoading && accommodationQuote?.accommodation && (
                  <p className="font-semibold text-foreground">
                    {accommodationQuote.accommodation.nights} night(s) × {formatUsd(accommodationQuote.accommodation.pricePerNight)} = {formatUsd(accommodationQuote.accommodation.total)}
                  </p>
                )}
                {accommodationNights < 1 && <p className="text-muted-foreground">Select valid check-in and check-out dates to see the total.</p>}
              </div>
            )}
          </div>

          <div className="grid items-start gap-5 lg:grid-cols-3">
              {registrationGroups.map((group) => (
                <div
                  key={group.title}
                  className={`overflow-hidden rounded-md border shadow-sm transition-all ${
                    isGroupAvailable(group, today)
                      ? "border-teal/50 bg-card shadow-teal/10"
                      : "border-border bg-muted/30 opacity-60"
                  }`}
                >
                  <div className={isGroupAvailable(group, today) ? "bg-teal px-5 py-4 text-white" : "bg-muted px-5 py-4"}>
                    <h3 className={`font-display text-xl font-bold ${isGroupAvailable(group, today) ? "text-white" : "text-foreground"}`}>{group.title}</h3>
                    <p className={isGroupAvailable(group, today) ? "text-sm font-semibold text-white/80" : "text-sm font-semibold text-muted-foreground"}>{group.date}</p>
                  </div>
                  <div className="divide-y divide-border px-5 py-1">
                    {group.categories.map((category) => {
                      const isAvailable = isGroupAvailable(group, today);

                      return (
                      <label
                        key={category.key}
                        className={`flex items-center justify-between gap-4 py-3 text-sm ${
                          isAvailable ? "cursor-pointer text-foreground hover:text-teal" : "cursor-not-allowed text-muted-foreground"
                        }`}
                      >
                        <span className="flex items-center gap-3">
                          <input
                            type="radio"
                            name="registration-category"
                            checked={selectedCategoryKey === category.key}
                            onChange={() => setSelectedCategoryKey(category.key)}
                            disabled={!isAvailable}
                            className="h-4 w-4 accent-teal"
                          />
                          <span>{category.label}</span>
                        </span>
                        <span className="font-display text-lg font-bold">{formatUsd(category.price)}</span>
                      </label>
                    )})}
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-md border border-teal/30 bg-gradient-to-br from-teal/15 via-card to-gold/10 p-5 shadow-lg shadow-teal/10 md:p-6">
              <label className="mb-2 block text-sm font-semibold text-foreground">
                No. of Participants ( $ under category )
              </label>
              <Input
                min={1}
                type="number"
                value={participants}
                onChange={(event) => setParticipants(Math.max(Number(event.target.value) || 1, 1))}
              />

              <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
                <Input
                  placeholder="Apply Coupon"
                  value={couponCode}
                  onChange={(event) => {
                    setCouponCode(event.target.value);
                    setAppliedCoupon(null);
                  }}
                />
                <Button type="button" variant="outline" onClick={handleApplyCoupon}>
                  Apply Coupon
                </Button>
              </div>
              {appliedCoupon ? (
                <div className="mt-3 rounded-md border border-teal/30 bg-teal/10 p-3 text-sm text-teal-900">
                  <p className="font-semibold">Coupon {appliedCoupon.code} applied</p>
                  <p className="mt-1">Original Price: {formatUsd(subtotalPrice)}</p>
                  <p>Discount: -{formatUsd(discount)}</p>
                  <p>Final Price: {formatUsd(totalRegistrationPrice)}</p>
                </div>
              ) : null}

              <div className="mt-6 rounded-md border border-border bg-card p-4">
                <h3 className="mb-4 font-display text-2xl font-bold text-card-foreground">Registration Summary</h3>
                <div className="mb-5">
                  <label className="mb-2 block text-sm font-semibold text-foreground">Payment Method</label>
                  <Select value={paymentChoice} onValueChange={(value) => setPaymentChoice(value as PaymentChoice)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select payment method" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="razorpay">Razorpay (UPI, Cards, Netbanking, Wallets)</SelectItem>
                      <SelectItem value="card">Credit / Debit Card</SelectItem>
                      <SelectItem value="paypal">PayPal</SelectItem>
                      <SelectItem value="stripe">Stripe</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-3 text-sm text-muted-foreground">
                  <p className="flex justify-between gap-4">
                    <span>A. Registration Price:</span>
                    <span className="font-semibold text-foreground">{formatUsd(registrationPrice)}</span>
                  </p>
                  <p className="flex justify-between gap-4">
                    <span>B. Participants:</span>
                    <span className="font-semibold text-foreground">{participants}</span>
                  </p>
                  <p className="flex justify-between gap-4">
                    <span>C. Discount:</span>
                    <span className="font-semibold text-foreground">-{formatUsd(discount)}</span>
                  </p>
                  <p className="flex justify-between gap-4">
                    <span>D. Total Registration Price:</span>
                    <span className="font-semibold text-foreground">{formatUsd(totalRegistrationPrice)}</span>
                  </p>
                  <p className="flex justify-between gap-4">
                    <span>I. Service Charge:</span>
                    <span className="font-semibold text-foreground">{formatUsd(serviceCharge)}</span>
                  </p>
                  {selectedAccommodation && accommodationCheckIn && accommodationCheckOut && (
                    <p className="flex justify-between gap-4">
                      <span>Accommodation ({accommodationNights} night(s)):</span>
                      <span className="font-semibold text-foreground">
                        {accommodationQuote ? formatUsd(accommodationTotal) : `${formatUsd(Number(selectedAccommodation.price_per_night) * accommodationNights)} (estimate)`}
                      </span>
                    </p>
                  )}
                  <p className="flex justify-between gap-4 border-t border-border pt-3 text-lg font-bold text-foreground">
                    <span>Total Price:</span>
                    <span>{formatUsd(
                      accommodationOptionId && accommodationQuote
                        ? accommodationQuote.amount.final
                        : totalPrice + (selectedAccommodation ? Number(selectedAccommodation.price_per_night) * accommodationNights : 0),
                    )}</span>
                  </p>
                </div>
              </div>


              <div className="mt-5">
                <CaptchaVerification
                  verified={isCaptchaVerified}
                  onVerifiedChange={setIsCaptchaVerified}
                  resetKey={captchaResetKey}
                />
              </div>

              <div className="mt-4 flex items-start gap-3 rounded-md border border-border bg-muted/30 p-4 text-sm leading-relaxed text-muted-foreground">
                <Checkbox
                  checked={hasAcceptedTerms}
                  onCheckedChange={(checked) => setHasAcceptedTerms(checked === true)}
                  aria-label="Accept Terms & Conditions"
                  className="mt-0.5"
                />
                <span>
                  I have read and agree to the{" "}
                  <button
                    type="button"
                    onClick={() => setIsTermsDialogOpen(true)}
                    className="font-semibold text-blue-600 underline underline-offset-2 hover:text-blue-700"
                  >
                    Terms &amp; Conditions
                  </button>
                  .
                </span>
              </div>

              <Dialog open={isTermsDialogOpen} onOpenChange={setIsTermsDialogOpen}>
                <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Terms &amp; Conditions</DialogTitle>
                    <DialogDescription>Please review the conference policies before continuing with registration.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-5 text-sm leading-relaxed text-muted-foreground">
                    <section className="space-y-2"><h3 className="font-semibold text-foreground">Important Note</h3><p>If the virtual conference is postponed due to unavoidable circumstances beyond the organizers&apos; control, including technical disruptions, force majeure events, government restrictions, cyber incidents, or other emergency situations, refunds will not be applicable. In such cases, registrations will remain valid for the rescheduled event or future conference edition.</p></section>
                    <section className="space-y-2"><h3 className="font-semibold text-foreground">Terms &amp; Conditions</h3><p>By registering for the virtual conference, participants agree to all conference terms and policies.</p><p>The organizers reserve the right to modify the conference program, speakers, schedule, or virtual platform if necessary.</p><p>Participants are responsible for ensuring stable internet connectivity and access to the required virtual meeting platform.</p><p>Conference access links and participation details will be shared with registered participants before the event.</p><p>Recording, redistribution, or unauthorized sharing of conference materials or access links is strictly prohibited.</p><p>In unavoidable circumstances, the conference may be postponed or rescheduled without prior notice.</p><p>If the conference is postponed, registrations will remain valid for the rescheduled event or future edition.</p><p>Participants are advised to regularly check the official conference website and registered email for updates and announcements.</p></section>
                    <section className="space-y-2"><h3 className="font-semibold text-foreground">Refund &amp; Cancellation Policy</h3><p>All cancellation requests must be submitted in writing via email to the Conference Secretariat.</p><p>Cancellation before 50 days of the conference: 50% refund</p><p>Cancellation before 40 days of the conference: 30% refund</p><p>Cancellation within 30 days of the conference: No refund</p><p>Registration may be transferred to another participant if the registered attendee is unable to participate.</p><p>Eligible refunds will be processed within 4 weeks after the completion of the conference.</p></section>
                    <section className="space-y-2"><h3 className="font-semibold text-foreground">Registration Includes</h3><h4 className="font-semibold text-foreground">For Virtual Speakers &amp; Participants</h4><p>Present your research from anywhere (home or workplace)</p><p>Access to all live/recorded conference sessions</p><p>E-copy of the Abstract Book and Program</p><p>E-Certificate of Participation/Presentation</p><p>Publication of accepted papers in Conference Proceedings (with ISBN/e-ISBN)</p></section>
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => { setHasAcceptedTerms(false); setIsTermsDialogOpen(false); }}>Deny</Button>
                    <Button type="button" className="bg-teal text-white hover:bg-teal/85" onClick={() => { setHasAcceptedTerms(true); setIsTermsDialogOpen(false); }}>Agree</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
                By clicking "Proceed to Register", you agree to the privacy policy, terms & conditions and cancellation
                policy.
              </p>

              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <Button type="button" variant="outline" onClick={handleReset} className="flex-1">
                  reset
                </Button>
                <Button
                  type="button"
                  onClick={handleProceed}
                  disabled={isSubmitting || !isCaptchaVerified || !hasAcceptedTerms || accommodationQuoteLoading || Boolean(accommodationOptionId && !accommodationQuote)}
                  className="flex-1 bg-teal text-white hover:bg-teal/85"
                >
                  {PHASE_LABELS[paymentPhase]}
                </Button>
              </div>
            </div>
          </div>
      </div>
    </section>
  );
};

export default PricingSection;
