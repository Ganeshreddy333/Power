import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/integrations/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type { Tables } from "@/integrations/api/types";

type Speaker = Tables<"speakers">;

const emptySpeaker = {
  name: "",
  title: "",
  organization: "",
  topic: "",
  bio: "",
  image_url: "",
  website_url: "",
  linkedin_url: "",
  twitter_url: "",
  session_type: "keynote",
  display_order: 1,
  is_visible: true,
};

const AdminSpeakers = () => {
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [form, setForm] = useState(emptySpeaker);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const fetchSpeakers = useCallback(async () => {
    const { data, error } = await apiClient
      .from("speakers")
      .select("*")
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    setSpeakers(data || []);
  }, [toast]);

  useEffect(() => {
    fetchSpeakers();
  }, [fetchSpeakers]);

  const resetForm = () => {
    setForm(emptySpeaker);
    setEditingId(null);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({ title: "Speaker name is required", variant: "destructive" });
      return;
    }

    const payload = {
      name: form.name.trim(),
      title: form.title.trim() || null,
      organization: form.organization.trim() || null,
      topic: form.topic.trim() || null,
      bio: form.bio.trim() || null,
      image_url: form.image_url.trim() || null,
      website_url: form.website_url.trim() || null,
      linkedin_url: form.linkedin_url.trim() || null,
      twitter_url: form.twitter_url.trim() || null,
      session_type: form.session_type.trim() || null,
      display_order: Number.isNaN(form.display_order) ? 0 : form.display_order,
      is_visible: form.is_visible,
    };

    const query = editingId
      ? apiClient.from("speakers").update(payload).eq("id", editingId)
      : apiClient.from("speakers").insert(payload);

    const { error } = await query;

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: editingId ? "Speaker updated!" : "Speaker created!" });
    setOpen(false);
    resetForm();
    await fetchSpeakers();
  };

  const handleEdit = (speaker: Speaker) => {
    setForm({
      name: speaker.name || "",
      title: speaker.title || "",
      organization: speaker.organization || "",
      topic: speaker.topic || "",
      bio: speaker.bio || "",
      image_url: speaker.image_url || "",
      website_url: speaker.website_url || "",
      linkedin_url: speaker.linkedin_url || "",
      twitter_url: speaker.twitter_url || "",
      session_type: speaker.session_type || "keynote",
      display_order: speaker.display_order || 0,
      is_visible: speaker.is_visible ?? true,
    });
    setEditingId(speaker.id);
    setOpen(true);
  };

  const handleDelete = async (id: string) => {
    const { error } = await apiClient.from("speakers").delete().eq("id", id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Speaker deleted" });
    await fetchSpeakers();
  };

  const handleVisibilityChange = async (speaker: Speaker, isVisible: boolean) => {
    const { error } = await apiClient
      .from("speakers")
      .update({ is_visible: isVisible })
      .eq("id", speaker.id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    setSpeakers((current) =>
      current.map((item) => (item.id === speaker.id ? { ...item, is_visible: isVisible } : item)),
    );
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
        <CardTitle className="font-display">Manage Speakers</CardTitle>
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
              <Plus className="w-4 h-4 mr-1" /> Add Speaker
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="font-display">{editingId ? "Edit Speaker" : "Add Speaker"}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Input
                  placeholder="Speaker Name *"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
                <Input
                  placeholder="Professional Title"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Input
                  placeholder="Organization"
                  value={form.organization}
                  onChange={(e) => setForm({ ...form, organization: e.target.value })}
                />
                <Input
                  placeholder="Session Type"
                  value={form.session_type}
                  onChange={(e) => setForm({ ...form, session_type: e.target.value })}
                />
              </div>
              <Input
                placeholder="Topic"
                value={form.topic}
                onChange={(e) => setForm({ ...form, topic: e.target.value })}
              />
              <Input
                placeholder="Image URL"
                value={form.image_url}
                onChange={(e) => setForm({ ...form, image_url: e.target.value })}
              />
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <Input
                  type="url"
                  placeholder="Website URL"
                  value={form.website_url}
                  onChange={(e) => setForm({ ...form, website_url: e.target.value })}
                />
                <Input
                  type="url"
                  placeholder="LinkedIn URL"
                  value={form.linkedin_url}
                  onChange={(e) => setForm({ ...form, linkedin_url: e.target.value })}
                />
                <Input
                  type="url"
                  placeholder="X / Twitter URL"
                  value={form.twitter_url}
                  onChange={(e) => setForm({ ...form, twitter_url: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-center">
                <div>
                  <label className="text-xs text-muted-foreground">Number of cards (0 hides from site)</label>
                  <Input
                    type="number"
                    min="0"
                    value={form.display_order}
                    onChange={(e) => setForm({ ...form, display_order: parseInt(e.target.value, 10) || 0 })}
                  />
                </div>
                <div className="flex items-center justify-between rounded-md border border-border px-3 py-2 mt-5">
                  <span className="text-sm">Visible on site</span>
                  <Switch
                    checked={form.is_visible}
                    onCheckedChange={(checked) => setForm({ ...form, is_visible: checked })}
                  />
                </div>
              </div>
              <textarea
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[120px]"
                placeholder="Speaker bio"
                value={form.bio}
                onChange={(e) => setForm({ ...form, bio: e.target.value })}
              />
              <Button onClick={handleSave} className="w-full">
                {editingId ? "Update" : "Create"} Speaker
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {speakers.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">No speakers added yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Speaker</TableHead>
                  <TableHead className="hidden md:table-cell">Topic</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Cards</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {speakers.map((speaker) => (
                  <TableRow key={speaker.id}>
                    <TableCell>
                      <div className="font-medium">{speaker.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {speaker.organization || speaker.title || "No organization yet"}
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{speaker.topic || "-"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Badge variant={speaker.is_visible ? "default" : "secondary"}>
                          {speaker.is_visible ? "Visible" : "Hidden"}
                        </Badge>
                        <Switch
                          checked={speaker.is_visible ?? true}
                          onCheckedChange={(checked) => handleVisibilityChange(speaker, checked)}
                        />
                      </div>
                    </TableCell>
                    <TableCell>{speaker.display_order ?? 0}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(speaker)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(speaker.id)}>
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

export default AdminSpeakers;
