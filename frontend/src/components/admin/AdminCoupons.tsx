import { useState, useEffect } from "react";
import { apiClient } from "@/integrations/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import type { Tables, TablesInsert } from "@/integrations/api/types";

type Coupon = Tables<"coupon_codes">;

type DiscountType = "percent" | "amount";

interface CouponFormState {
  code: string;
  description: string;
  discountType: DiscountType;
  discountValue: number;
  max_uses: number;
  is_active: boolean;
  valid_until: string;
}

const emptyCoupon: CouponFormState = {
  code: "",
  description: "",
  discountType: "percent",
  discountValue: 0,
  max_uses: 100,
  is_active: true,
  valid_until: "",
};

const AdminCoupons = () => {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [form, setForm] = useState<CouponFormState>(emptyCoupon);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [generatedCoupon, setGeneratedCoupon] = useState<{ code: string; discount: string; link: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const { toast } = useToast();

  const buildRegistrationLink = (code: string) => {
    const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || window.location.origin || "https://renewableenergy2027.com").replace(/\/$/, "");
    return `${baseUrl}/registration?coupon=${encodeURIComponent(code.trim().toUpperCase())}`;
  };

  const copyRegistrationLink = async (code: string) => {
    const link = buildRegistrationLink(code);
    try {
      await navigator.clipboard.writeText(link);
      toast({ title: "Link copied", description: "Registration link copied to clipboard." });
    } catch {
      toast({ title: "Copy failed", description: "Could not copy the registration link automatically.", variant: "destructive" });
    }
  };

  const fetchCoupons = async () => {
    const { data } = await apiClient.from("coupon_codes").select("*").order("created_at", { ascending: false });
    if (data) setCoupons(data);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchCoupons();
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchCoupons();
    // Poll so the live usage counter (current_uses/max_uses) reflects orders that
    // reserve coupon uses as they happen, without a manual reload.
    const interval = window.setInterval(() => {
      fetchCoupons();
    }, 25_000);
    return () => window.clearInterval(interval);
  }, []);

  const handleSave = async () => {
    if (!form.code.trim()) {
      toast({ title: "Coupon code is required", variant: "destructive" });
      return;
    }

    if (form.discountValue <= 0) {
      toast({ title: "Discount value is required", variant: "destructive" });
      return;
    }

    const payload: TablesInsert<"coupon_codes"> = {
      code: form.code.toUpperCase(),
      description: form.description || null,
      discount_percent: form.discountType === "percent" ? form.discountValue : null,
      discount_amount: form.discountType === "amount" ? form.discountValue : null,
      max_uses: form.max_uses || null,
      is_active: form.is_active,
      valid_until: form.valid_until || null,
    };

    const createdCode = payload.code || form.code.toUpperCase();
    const discountText = form.discountType === "percent" ? `${form.discountValue}%` : `$${form.discountValue}`;
    const nextLink = buildRegistrationLink(createdCode);

    if (editingId) {
      const { error } = await apiClient.from("coupon_codes").update(payload).eq("id", editingId);
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
        return;
      }
      setGeneratedCoupon({ code: createdCode, discount: discountText, link: nextLink });
      toast({
        title: "Coupon updated",
        description: `Coupon ${createdCode} is ready for registration links.`,
      });
    } else {
      const { error } = await apiClient.from("coupon_codes").insert(payload);
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
        return;
      }
      setGeneratedCoupon({ code: createdCode, discount: discountText, link: nextLink });
      toast({
        title: "Coupon created successfully",
        description: `Coupon: ${createdCode}\nDiscount: ${discountText}\nRegistration Link: ${nextLink}`,
      });
    }

    setForm(emptyCoupon);
    setEditingId(null);
    setOpen(false);
    fetchCoupons();
  };

  const handleEdit = (coupon: Coupon) => {
    const hasAmount = coupon.discount_amount != null && coupon.discount_amount > 0;
    setForm({
      code: coupon.code,
      description: coupon.description || "",
      discountType: hasAmount ? "amount" : "percent",
      discountValue: hasAmount ? Number(coupon.discount_amount) : coupon.discount_percent || 0,
      max_uses: coupon.max_uses || 100,
      is_active: coupon.is_active ?? true,
      valid_until: coupon.valid_until ? coupon.valid_until.split("T")[0] : "",
    });
    setEditingId(coupon.id);
    setOpen(true);
  };

  const handleDelete = async (id: string) => {
    const { error } = await apiClient.from("coupon_codes").delete().eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Coupon deleted" });
    fetchCoupons();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="font-display">Manage Coupons</CardTitle>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`w-4 h-4 mr-1 ${refreshing ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Dialog
          open={open}
          onOpenChange={(value) => {
            setOpen(value);
            if (!value) {
              setForm(emptyCoupon);
              setEditingId(null);
            }
          }}
        >
          <DialogTrigger asChild>
            <Button className="gold-gradient text-hero-bg">
              <Plus className="w-4 h-4 mr-1" /> Add Coupon
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="font-display">{editingId ? "Edit Coupon" : "Add Coupon"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <Input placeholder="Coupon Code *" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
              <Input placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1.5fr]">
                <div>
                  <label className="text-xs text-muted-foreground">Discount Type</label>
                  <select
                    className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    value={form.discountType}
                    onChange={(e) => setForm({ ...form, discountType: e.target.value as DiscountType, discountValue: 0 })}
                  >
                    <option value="percent">Percentage</option>
                    <option value="amount">Fixed Amount</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">
                    {form.discountType === "percent" ? "Discount Percent (%)" : "Discount Amount ($)"}
                  </label>
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    value={form.discountValue}
                    onChange={(e) => setForm({ ...form, discountValue: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Max Uses</label>
                  <Input type="number" value={form.max_uses} onChange={(e) => setForm({ ...form, max_uses: parseInt(e.target.value, 10) || 0 })} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Valid Until</label>
                  <Input type="date" value={form.valid_until} onChange={(e) => setForm({ ...form, valid_until: e.target.value })} />
                </div>
              </div>
              <Button onClick={handleSave} className="w-full">
                {editingId ? "Update" : "Create"} Coupon
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {generatedCoupon ? (
          <div className="mb-4 rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-900">
            <p className="font-semibold">Coupon created successfully</p>
            <p className="mt-1">Coupon: {generatedCoupon.code}</p>
            <p>Discount: {generatedCoupon.discount}</p>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
              <span className="font-medium">Registration Link:</span>
              <a href={generatedCoupon.link} target="_blank" rel="noreferrer" className="break-all text-blue-700 underline">
                {generatedCoupon.link}
              </a>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => copyRegistrationLink(generatedCoupon.code)}
              >
                Copy Link
              </Button>
            </div>
          </div>
        ) : null}

        {coupons.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">No coupons yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Discount</TableHead>
                  <TableHead className="min-w-[280px]">Registration Link</TableHead>
                  <TableHead className="hidden md:table-cell">Uses</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {coupons.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono font-bold">{c.code}</TableCell>
                    <TableCell>
                      {c.discount_percent ? `${c.discount_percent}%` : c.discount_amount ? `$${c.discount_amount}` : "-"}
                    </TableCell>
                    <TableCell>
                      <div className="flex min-w-[260px] items-center gap-2">
                        <a
                          href={buildRegistrationLink(c.code)}
                          target="_blank"
                          rel="noreferrer"
                          className="max-w-[220px] truncate text-xs text-blue-700 underline"
                          title={buildRegistrationLink(c.code)}
                        >
                          {buildRegistrationLink(c.code)}
                        </a>
                        <Button type="button" size="sm" variant="outline" onClick={() => copyRegistrationLink(c.code)}>
                          Copy
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{c.current_uses}/{c.max_uses || "Unlimited"}</TableCell>
                    <TableCell>
                      <Badge variant={c.is_active ? "default" : "secondary"}>
                        {c.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(c)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(c.id)}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AdminCoupons;
