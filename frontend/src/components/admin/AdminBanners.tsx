"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/integrations/api/client";
import type { Tables, TablesInsert } from "@/integrations/api/types";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ANNOUNCEMENT_BANNER_CATEGORY, getAnnouncementBannerPhotos, isSafeAnnouncementLink } from "@/lib/announcementBanners";
import { ImagePlus, Megaphone, Pencil, Plus, Trash2, X } from "lucide-react";

type AnnouncementBanner = Tables<"information_blocks">;
type BannerForm = {
  title: string;
  subtitle: string;
  content: string;
  cta_label: string;
  cta_url: string;
  display_order: number;
  is_visible: boolean;
  image_urls: string[];
};

const emptyBanner: BannerForm = {
  title: "",
  subtitle: "",
  content: "",
  cta_label: "",
  cta_url: "",
  display_order: 0,
  is_visible: true,
  image_urls: [],
};

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const AdminBanners = () => {
  const [banners, setBanners] = useState<AnnouncementBanner[]>([]);
  const [form, setForm] = useState<BannerForm>(emptyBanner);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  const fetchBanners = useCallback(async () => {
    const { data, error } = await apiClient
      .from("information_blocks")
      .select("*")
      .eq("category", ANNOUNCEMENT_BANNER_CATEGORY)
      .order("display_order", { ascending: true });

    if (error) {
      toast({ title: "Could not load banners", description: error.message, variant: "destructive" });
      return;
    }

    setBanners(data || []);
  }, [toast]);

  useEffect(() => {
    void fetchBanners();
  }, [fetchBanners]);

  const resetForm = () => {
    setForm(emptyBanner);
    setEditingId(null);
  };

  const handleUpload = async (files: File[]) => {
    if (!files.length) return;
    const invalidFile = files.find((file) => !IMAGE_TYPES.has(file.type) || file.size > MAX_IMAGE_BYTES);
    if (invalidFile) {
      toast({
        title: "Unsupported image",
        description: !IMAGE_TYPES.has(invalidFile.type)
          ? "Choose JPEG, PNG, or WebP photos."
          : "Each photo must be no larger than 5 MB.",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);
    const uploadedUrls: string[] = [];
    let uploadError: string | null = null;
    try {
      for (const file of files) {
        const extension = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
        const { data, error } = await apiClient.storage
          .from("banner-images")
          .upload(`${crypto.randomUUID()}.${extension}`, file);
        if (error || typeof data?.url !== "string" || !data.url) {
          uploadError = error?.message || "The storage service returned no image URL.";
          break;
        }
        uploadedUrls.push(data.url);
      }
    } catch (error) {
      uploadError = error instanceof Error ? error.message : "The photo upload failed.";
    } finally {
      setUploading(false);
    }

    if (uploadedUrls.length) {
      setForm((current) => ({ ...current, image_urls: [...current.image_urls, ...uploadedUrls] }));
    }

    if (uploadError) {
      toast({
        title: uploadedUrls.length ? "Some photos could not be uploaded" : "Photo upload failed",
        description: uploadError,
        variant: "destructive",
      });
      return;
    }

    toast({ title: "Photos uploaded", description: "Save the banner to publish these photos." });
  };

  const handleSave = async () => {
    if (!form.title.trim() && !form.content.trim() && !form.image_urls.length) {
      toast({ title: "Add a heading, message, or photo before saving", variant: "destructive" });
      return;
    }

    const ctaLabel = form.cta_label.trim();
    const ctaUrl = form.cta_url.trim();
    if (Boolean(ctaLabel) !== Boolean(ctaUrl)) {
      toast({ title: "Add both a button label and link, or leave both blank", variant: "destructive" });
      return;
    }
    if (ctaUrl && !isSafeAnnouncementLink(ctaUrl)) {
      toast({
        title: "Invalid button link",
        description: "Use a site path, anchor, or an http(s) URL.",
        variant: "destructive",
      });
      return;
    }

    const payload: TablesInsert<"information_blocks"> = {
      title: form.title.trim(),
      subtitle: form.subtitle.trim() || null,
      content: form.content.trim() || null,
      image_urls: form.image_urls,
      category: ANNOUNCEMENT_BANNER_CATEGORY,
      cta_label: ctaLabel || null,
      cta_url: ctaUrl || null,
      display_order: form.display_order,
      is_visible: form.is_visible,
    };

    const query = editingId
      ? apiClient.from("information_blocks").update(payload).eq("id", editingId)
      : apiClient.from("information_blocks").insert(payload);
    const { error } = await query;

    if (error) {
      toast({ title: "Could not save banner", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: editingId ? "Banner updated" : "Banner created" });
    setOpen(false);
    resetForm();
    await fetchBanners();
  };

  const handleEdit = (banner: AnnouncementBanner) => {
    setForm({
      title: banner.title,
      subtitle: banner.subtitle || "",
      content: banner.content || "",
      cta_label: banner.cta_label || "",
      cta_url: banner.cta_url || "",
      display_order: banner.display_order || 0,
      is_visible: banner.is_visible ?? true,
      image_urls: getAnnouncementBannerPhotos(banner.image_urls),
    });
    setEditingId(banner.id);
    setOpen(true);
  };

  const handleDelete = async (id: string) => {
    const { error } = await apiClient.from("information_blocks").delete().eq("id", id);

    if (error) {
      toast({ title: "Could not delete banner", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Banner deleted" });
    await fetchBanners();
  };

  const handleVisibilityChange = async (banner: AnnouncementBanner, isVisible: boolean) => {
    const { error } = await apiClient
      .from("information_blocks")
      .update({ is_visible: isVisible })
      .eq("id", banner.id);

    if (error) {
      toast({ title: "Could not update banner status", description: error.message, variant: "destructive" });
      return;
    }

    setBanners((current) =>
      current.map((item) => (item.id === banner.id ? { ...item, is_visible: isVisible } : item)),
    );
  };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 font-display">
          <Megaphone className="h-5 w-5" /> Homepage Highlights
        </CardTitle>
        <Dialog
          open={open}
          onOpenChange={(value) => {
            if (!value && uploading) return;
            setOpen(value);
            if (!value) resetForm();
          }}
        >
          <DialogTrigger asChild>
            <Button className="gold-gradient text-hero-bg">
              <Plus className="mr-1 h-4 w-4" /> Add Highlight
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-display">{editingId ? "Edit Homepage Highlight" : "Add Homepage Highlight"}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-5">
              <div className="grid gap-3">
                <h3 className="font-semibold">Text</h3>
                <div className="flex gap-2">
                  <Input
                    placeholder="Main heading (optional)"
                    value={form.title}
                    onChange={(event) => setForm({ ...form, title: event.target.value })}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setForm((current) => ({ ...current, title: "" }))}
                    disabled={!form.title}
                  >
                    Remove heading
                  </Button>
                </div>
                <Textarea
                  placeholder="Message (optional)"
                  value={form.content}
                  onChange={(event) => setForm({ ...form, content: event.target.value })}
                />
                <Input
                  placeholder="Supporting line (optional)"
                  value={form.subtitle}
                  onChange={(event) => setForm({ ...form, subtitle: event.target.value })}
                />
                <div className="grid gap-3 md:grid-cols-2">
                  <Input
                    placeholder="Button label (optional)"
                    value={form.cta_label}
                    onChange={(event) => setForm({ ...form, cta_label: event.target.value })}
                  />
                  <Input
                    placeholder="Button link (e.g. /registration)"
                    value={form.cta_url}
                    onChange={(event) => setForm({ ...form, cta_url: event.target.value })}
                  />
                </div>
              </div>

              <div className="grid gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="font-semibold">Photos</h3>
                    <p className="text-sm text-muted-foreground">Add JPEG, PNG, or WebP photos up to 5 MB each.</p>
                  </div>
                  {form.image_urls.length ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setForm((current) => ({ ...current, image_urls: [] }))}
                      disabled={uploading}
                    >
                      Remove all photos
                    </Button>
                  ) : null}
                </div>
                <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-4 py-5 text-center transition-colors hover:bg-muted/60">
                  <ImagePlus className="h-6 w-6 text-muted-foreground" />
                  <span className="text-sm font-medium">{uploading ? "Uploading photos…" : "Add photos"}</span>
                  <Input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    className="sr-only"
                    disabled={uploading}
                    onChange={(event) => {
                      const files = Array.from(event.currentTarget.files || []);
                      event.currentTarget.value = "";
                      void handleUpload(files);
                    }}
                  />
                </label>
                {form.image_urls.length ? (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {form.image_urls.map((url, index) => (
                      <div key={`${url}-${index}`} className="relative aspect-[4/3] overflow-hidden rounded-md border">
                        <Image
                          src={url}
                          alt={`${form.title.trim() || "Homepage highlight"} photo ${index + 1}`}
                          fill
                          unoptimized
                          sizes="(max-width: 640px) 50vw, 33vw"
                          className="object-cover"
                        />
                        <Button
                          type="button"
                          variant="destructive"
                          size="icon"
                          aria-label={`Remove photo ${index + 1}`}
                          className="absolute right-2 top-2 h-8 w-8"
                          disabled={uploading}
                          onClick={() => setForm((current) => ({
                            ...current,
                            image_urls: current.image_urls.filter((_, photoIndex) => photoIndex !== index),
                          }))}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No photos added yet.</p>
                )}
                <p className="text-xs text-muted-foreground">Photos are uploaded now and published when you save the highlight.</p>
              </div>

              <div className="grid items-center gap-3 md:grid-cols-2">
                <Input
                  type="number"
                  placeholder="Display order"
                  value={form.display_order}
                  onChange={(event) => setForm({ ...form, display_order: Number(event.target.value) || 0 })}
                />
                <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                  <span className="text-sm">Show on homepage</span>
                  <Switch checked={form.is_visible} onCheckedChange={(checked) => setForm({ ...form, is_visible: checked })} />
                </div>
              </div>
              <Button onClick={handleSave} className="w-full" disabled={uploading}>
                {editingId ? "Save Changes" : "Create Highlight"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {banners.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">No homepage highlights created yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Highlight</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {banners.map((banner) => (
                  <TableRow key={banner.id}>
                    <TableCell>
                      <div className="font-medium">{banner.title || "Photo highlight"}</div>
                      <div className="max-w-md truncate text-sm text-muted-foreground">
                        {banner.content || `${getAnnouncementBannerPhotos(banner.image_urls).length} photo(s)`}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Badge variant={banner.is_visible ? "default" : "secondary"}>
                          {banner.is_visible ? "Live" : "Hidden"}
                        </Badge>
                        <Switch
                          checked={banner.is_visible ?? false}
                          onCheckedChange={(checked) => handleVisibilityChange(banner, checked)}
                          aria-label={`Set ${banner.title || "highlight"} ${banner.is_visible ? "hidden" : "live"}`}
                        />
                      </div>
                    </TableCell>
                    <TableCell>{banner.display_order ?? 0}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(banner)} aria-label={`Edit ${banner.title || "highlight"}`}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(banner.id)} aria-label={`Delete ${banner.title || "highlight"}`}>
                          <Trash2 className="h-4 w-4 text-destructive" />
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

export default AdminBanners;
