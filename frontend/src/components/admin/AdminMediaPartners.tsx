import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/integrations/api/client";
import type { Tables, TablesInsert } from "@/integrations/api/types";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Pencil, Plus, Trash2 } from "lucide-react";

type MediaPartner = Tables<"media_partners">;

const emptyPartner = {
  name: "",
  tier: "Media Partner",
  website_url: "",
  logo_url: "",
  description: "",
  display_order: 0,
  is_visible: true,
};

const defaultPartners: TablesInsert<"media_partners">[] = [
  {
    name: "Global Materials Review",
    tier: "Media Partner",
    website_url: "#",
    logo_url: null,
    description: "Conference and research media coverage.",
    display_order: 1,
    is_visible: true,
  },
  {
    name: "NanoTech Journal",
    tier: "Publishing Partner",
    website_url: "#",
    logo_url: null,
    description: "Special issue and post-event dissemination.",
    display_order: 2,
    is_visible: true,
  },
  {
    name: "Applied Engineering World",
    tier: "Outreach Partner",
    website_url: "#",
    logo_url: null,
    description: "Academic and industry audience amplification.",
    display_order: 3,
    is_visible: true,
  },
];

const AdminMediaPartners = () => {
  const [partners, setPartners] = useState<MediaPartner[]>([]);
  const [form, setForm] = useState(emptyPartner);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const fetchPartners = useCallback(async () => {
    const { data, error } = await apiClient
      .from("media_partners")
      .select("*")
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    setPartners(data || []);
  }, [toast]);

  useEffect(() => {
    fetchPartners();
  }, [fetchPartners]);

  const resetForm = () => {
    setForm(emptyPartner);
    setEditingId(null);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({ title: "Partner name is required", variant: "destructive" });
      return;
    }

    const payload: TablesInsert<"media_partners"> = {
      name: form.name.trim(),
      tier: form.tier.trim() || "Media Partner",
      website_url: form.website_url.trim() || null,
      logo_url: form.logo_url.trim() || null,
      description: form.description.trim() || null,
      display_order: form.display_order || 0,
      is_visible: form.is_visible,
    };

    const query = editingId
      ? apiClient.from("media_partners").update(payload).eq("id", editingId)
      : apiClient.from("media_partners").insert(payload);

    const { error } = await query;

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: editingId ? "Media partner updated" : "Media partner created" });
    setOpen(false);
    resetForm();
    await fetchPartners();
  };

  const handleEdit = (partner: MediaPartner) => {
    setForm({
      name: partner.name,
      tier: partner.tier || "Media Partner",
      website_url: partner.website_url || "",
      logo_url: partner.logo_url || "",
      description: partner.description || "",
      display_order: partner.display_order || 0,
      is_visible: partner.is_visible ?? true,
    });
    setEditingId(partner.id);
    setOpen(true);
  };

  const handleDelete = async (id: string) => {
    const { error } = await apiClient.from("media_partners").delete().eq("id", id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Media partner deleted" });
    await fetchPartners();
  };

  const seedDefaultPartners = async () => {
    const { error } = await apiClient.from("media_partners").insert(defaultPartners);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Default media partners added" });
    fetchPartners();
  };

  const handleVisibilityChange = async (partner: MediaPartner, isVisible: boolean) => {
    const { error } = await apiClient
      .from("media_partners")
      .update({ is_visible: isVisible })
      .eq("id", partner.id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    setPartners((current) =>
      current.map((item) => (item.id === partner.id ? { ...item, is_visible: isVisible } : item)),
    );
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
        <CardTitle className="font-display">Manage Media Partners</CardTitle>
        <Dialog
          open={open}
          onOpenChange={(value) => {
            setOpen(value);
            if (!value) {
              resetForm();
            }
          }}
        >
          <DialogTrigger asChild>
            <Button className="gold-gradient text-hero-bg">
              <Plus className="w-4 h-4 mr-1" /> Add Partner
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="font-display">{editingId ? "Edit Partner" : "Add Partner"}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Input placeholder="Partner Name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                <Input placeholder="Tier" value={form.tier} onChange={(e) => setForm({ ...form, tier: e.target.value })} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Input placeholder="Website URL" value={form.website_url} onChange={(e) => setForm({ ...form, website_url: e.target.value })} />
                <Input placeholder="Logo/Image URL" value={form.logo_url} onChange={(e) => setForm({ ...form, logo_url: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Number of cards (0 hides from site)</label>
                <Input type="number" min="0" placeholder="Number of cards" value={form.display_order} onChange={(e) => setForm({ ...form, display_order: parseInt(e.target.value, 10) || 0 })} />
              </div>
              <textarea className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[110px]" placeholder="Short description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                <span className="text-sm">Visible on site</span>
                <Switch checked={form.is_visible} onCheckedChange={(checked) => setForm({ ...form, is_visible: checked })} />
              </div>
              <Button onClick={handleSave} className="w-full">
                {editingId ? "Update" : "Create"} Partner
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {partners.length === 0 ? (
          <div className="space-y-4 text-center py-8">
            <p className="text-muted-foreground">No media partners added yet.</p>
            <Button onClick={seedDefaultPartners} className="mx-auto">
              Add Default Media Partners
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Partner</TableHead>
                  <TableHead className="hidden md:table-cell">Tier</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Cards</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {partners.map((partner) => (
                  <TableRow key={partner.id}>
                    <TableCell>
                      <div className="font-medium">{partner.name}</div>
                      <div className="text-sm text-muted-foreground">{partner.website_url || "No website linked"}</div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{partner.tier || "-"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Badge variant={partner.is_visible ? "default" : "secondary"}>{partner.is_visible ? "Visible" : "Hidden"}</Badge>
                        <Switch checked={partner.is_visible ?? true} onCheckedChange={(checked) => handleVisibilityChange(partner, checked)} />
                      </div>
                    </TableCell>
                    <TableCell>{partner.display_order ?? 0}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(partner)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(partner.id)}>
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

export default AdminMediaPartners;
