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

type InformationBlock = Tables<"information_blocks">;

const emptyBlock = {
  title: "",
  subtitle: "",
  content: "",
  category: "general",
  cta_label: "",
  cta_url: "",
  display_order: 0,
  is_visible: true,
};

const AdminInformation = () => {
  const [blocks, setBlocks] = useState<InformationBlock[]>([]);
  const [form, setForm] = useState(emptyBlock);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const fetchBlocks = useCallback(async () => {
    const { data, error } = await apiClient
      .from("information_blocks")
      .select("*")
      .order("category", { ascending: true })
      .order("display_order", { ascending: true });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    setBlocks(data || []);
  }, [toast]);

  useEffect(() => {
    fetchBlocks();
  }, [fetchBlocks]);

  const resetForm = () => {
    setForm(emptyBlock);
    setEditingId(null);
  };

  const handleSave = async () => {
    if (!form.title.trim()) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }

    const payload: TablesInsert<"information_blocks"> = {
      title: form.title.trim(),
      subtitle: form.subtitle.trim() || null,
      content: form.content.trim() || null,
      category: form.category.trim() || "general",
      cta_label: form.cta_label.trim() || null,
      cta_url: form.cta_url.trim() || null,
      display_order: form.display_order || 0,
      is_visible: form.is_visible,
    };

    const query = editingId
      ? apiClient.from("information_blocks").update(payload).eq("id", editingId)
      : apiClient.from("information_blocks").insert(payload);

    const { error } = await query;

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: editingId ? "Information block updated" : "Information block created" });
    setOpen(false);
    resetForm();
    await fetchBlocks();
  };

  const handleEdit = (block: InformationBlock) => {
    setForm({
      title: block.title,
      subtitle: block.subtitle || "",
      content: block.content || "",
      category: block.category || "general",
      cta_label: block.cta_label || "",
      cta_url: block.cta_url || "",
      display_order: block.display_order || 0,
      is_visible: block.is_visible ?? true,
    });
    setEditingId(block.id);
    setOpen(true);
  };

  const handleDelete = async (id: string) => {
    const { error } = await apiClient.from("information_blocks").delete().eq("id", id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Information block deleted" });
    await fetchBlocks();
  };

  const handleVisibilityChange = async (block: InformationBlock, isVisible: boolean) => {
    const { error } = await apiClient
      .from("information_blocks")
      .update({ is_visible: isVisible })
      .eq("id", block.id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    setBlocks((current) =>
      current.map((item) => (item.id === block.id ? { ...item, is_visible: isVisible } : item)),
    );
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
        <CardTitle className="font-display">Manage Information</CardTitle>
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
              <Plus className="w-4 h-4 mr-1" /> Add Block
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="font-display">{editingId ? "Edit Block" : "Add Block"}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Input placeholder="Title *" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                <Input placeholder="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
              </div>
              <Input placeholder="Subtitle" value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} />
              <textarea className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[120px]" placeholder="Content" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Input placeholder="CTA Label" value={form.cta_label} onChange={(e) => setForm({ ...form, cta_label: e.target.value })} />
                <Input placeholder="CTA URL" value={form.cta_url} onChange={(e) => setForm({ ...form, cta_url: e.target.value })} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-center">
                <Input type="number" placeholder="Display Order" value={form.display_order} onChange={(e) => setForm({ ...form, display_order: parseInt(e.target.value, 10) || 0 })} />
                <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                  <span className="text-sm">Visible on site</span>
                  <Switch checked={form.is_visible} onCheckedChange={(checked) => setForm({ ...form, is_visible: checked })} />
                </div>
              </div>
              <Button onClick={handleSave} className="w-full">
                {editingId ? "Update" : "Create"} Block
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {blocks.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">No information blocks added yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead className="hidden md:table-cell">Category</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {blocks.map((block) => (
                  <TableRow key={block.id}>
                    <TableCell>
                      <div className="font-medium">{block.title}</div>
                      <div className="text-sm text-muted-foreground">{block.subtitle || "No subtitle"}</div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{block.category || "general"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Badge variant={block.is_visible ? "default" : "secondary"}>{block.is_visible ? "Visible" : "Hidden"}</Badge>
                        <Switch checked={block.is_visible ?? true} onCheckedChange={(checked) => handleVisibilityChange(block, checked)} />
                      </div>
                    </TableCell>
                    <TableCell>{block.display_order ?? 0}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(block)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(block.id)}>
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

export default AdminInformation;
