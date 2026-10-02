import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/integrations/api/client";
import type { Tables, TablesInsert } from "@/integrations/api/types";
import { getDefaultSiteDataValue } from "@/hooks/useSiteData";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Pencil, Plus, Save, Trash2 } from "lucide-react";

type SiteData = Tables<"site_data">;

const suggestedRows: Array<TablesInsert<"site_data">> = [
  { data_key: "hero_eyebrow", label: "Hero Eyebrow", value: getDefaultSiteDataValue("hero_eyebrow"), group_name: "hero", value_type: "text", is_public: true },
  { data_key: "hero_theme", label: "Hero Theme", value: getDefaultSiteDataValue("hero_theme"), group_name: "hero", value_type: "textarea", is_public: true },
  { data_key: "footer_description", label: "Footer Description", value: getDefaultSiteDataValue("footer_description"), group_name: "footer", value_type: "textarea", is_public: true },
  { data_key: "contact_email", label: "Contact Email", value: getDefaultSiteDataValue("contact_email"), group_name: "contact", value_type: "email", is_public: true },
  { data_key: "contact_phone", label: "Contact Phone", value: getDefaultSiteDataValue("contact_phone"), group_name: "contact", value_type: "text", is_public: true },
  { data_key: "organizer_name", label: "Organizer Name", value: getDefaultSiteDataValue("organizer_name"), group_name: "conference", value_type: "text", is_public: true },
  { data_key: "conference_venue", label: "Conference Venue", value: getDefaultSiteDataValue("conference_venue"), group_name: "contact", value_type: "text", is_public: true },
];

const websiteContentManagedSiteDataKeys = new Set([
  "hero_title_primary",
  "hero_title_secondary",
  "hero_date_line",
  "conference_start_datetime_utc",
  "conference_end_datetime_utc",
]);

const emptyRow = {
  data_key: "",
  label: "",
  value: "",
  group_name: "general",
  value_type: "text",
  is_public: true,
};

const AdminSiteData = () => {
  const [rows, setRows] = useState<SiteData[]>([]);
  const [form, setForm] = useState(emptyRow);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const fetchRows = useCallback(async () => {
    const { data, error } = await apiClient
      .from("site_data")
      .select("*")
      .order("group_name", { ascending: true })
      .order("label", { ascending: true });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    setRows((data || []).filter((row: SiteData) => !websiteContentManagedSiteDataKeys.has(row.data_key)));
  }, [toast]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const seedSuggestedRows = async () => {
    for (const row of suggestedRows) {
      const exists = rows.find((item) => item.data_key === row.data_key);
      if (!exists) {
        await apiClient.from("site_data").insert(row);
      }
    }

    toast({ title: "Suggested site data added" });
    await fetchRows();
  };

  const resetForm = () => {
    setForm(emptyRow);
    setEditingId(null);
  };

  const handleSave = async () => {
    if (!form.data_key.trim() || !form.label.trim()) {
      toast({ title: "Key and label are required", variant: "destructive" });
      return;
    }

    const payload: TablesInsert<"site_data"> = {
      data_key: form.data_key.trim(),
      label: form.label.trim(),
      value: form.value.trim() || null,
      group_name: form.group_name.trim() || "general",
      value_type: form.value_type.trim() || "text",
      is_public: form.is_public,
    };

    const query = editingId
      ? apiClient.from("site_data").update(payload).eq("id", editingId)
      : apiClient.from("site_data").insert(payload);

    const { error } = await query;

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: editingId ? "Site data updated" : "Site data created" });
    setOpen(false);
    resetForm();
    await fetchRows();
  };

  const handleEdit = (row: SiteData) => {
    setForm({
      data_key: row.data_key,
      label: row.label,
      value: row.value || "",
      group_name: row.group_name || "general",
      value_type: row.value_type || "text",
      is_public: row.is_public ?? true,
    });
    setEditingId(row.id);
    setOpen(true);
  };

  const handleDelete = async (id: string) => {
    const { error } = await apiClient.from("site_data").delete().eq("id", id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Site data deleted" });
    await fetchRows();
  };

  const handlePublicChange = async (row: SiteData, isPublic: boolean) => {
    const { error } = await apiClient.from("site_data").update({ is_public: isPublic }).eq("id", row.id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    setRows((current) =>
      current.map((item) => (item.id === row.id ? { ...item, is_public: isPublic } : item)),
    );
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
        <CardTitle className="font-display">Manage Site Data</CardTitle>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={seedSuggestedRows}>
            <Save className="w-4 h-4 mr-1" /> Seed Defaults
          </Button>
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
                <Plus className="w-4 h-4 mr-1" /> Add Data Row
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-xl">
              <DialogHeader>
                <DialogTitle className="font-display">{editingId ? "Edit Data Row" : "Add Data Row"}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Input placeholder="Key *" value={form.data_key} onChange={(e) => setForm({ ...form, data_key: e.target.value })} />
                  <Input placeholder="Label *" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Input placeholder="Group" value={form.group_name} onChange={(e) => setForm({ ...form, group_name: e.target.value })} />
                  <Input placeholder="Value Type" value={form.value_type} onChange={(e) => setForm({ ...form, value_type: e.target.value })} />
                </div>
                <textarea className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[110px]" placeholder="Value" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
                <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                  <span className="text-sm">Publicly visible</span>
                  <Switch checked={form.is_public} onCheckedChange={(checked) => setForm({ ...form, is_public: checked })} />
                </div>
                <Button onClick={handleSave} className="w-full">
                  {editingId ? "Update" : "Create"} Data Row
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">No site data yet. Seed defaults to get started.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Key</TableHead>
                  <TableHead className="hidden md:table-cell">Group</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="font-medium">{row.label}</div>
                      <div className="text-xs text-muted-foreground font-mono">{row.data_key}</div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{row.group_name || "general"}</TableCell>
                    <TableCell className="max-w-[300px] truncate">{row.value || "-"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Badge variant={row.is_public ? "default" : "secondary"}>{row.is_public ? "Public" : "Private"}</Badge>
                        <Switch checked={row.is_public ?? true} onCheckedChange={(checked) => handlePublicChange(row, checked)} />
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(row)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(row.id)}>
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

export default AdminSiteData;
