"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/integrations/api/client";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type Props = {
  bucket: "speaker-images" | "media-partner-images";
  label: string;
  value: string;
  onChange: (url: string) => void;
  onUploadingChange: (uploading: boolean) => void;
  onPendingChange: (pending: boolean) => void;
  active: boolean;
};

const ImageUploadField = ({ bucket, label, value, onChange, onUploadingChange, onPendingChange, active }: Props) => {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!active) {
      setFile(null);
      onPendingChange(false);
    }
  }, [active, onPendingChange]);

  useEffect(() => {
    if (!file) {
      try {
        const url = new URL(value);
        setPreview(["http:", "https:"].includes(url.protocol) ? url.toString() : "");
      } catch {
        setPreview("");
      }
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file, value]);

  const handleFile = (selected: File | undefined) => {
    if (!selected) return;
    if (!IMAGE_TYPES.has(selected.type)) {
      toast({ title: "Unsupported image", description: "Choose a JPEG, PNG, or WebP image.", variant: "destructive" });
      return;
    }
    if (selected.size > MAX_IMAGE_BYTES) {
      toast({ title: "Image is too large", description: "Choose an image no larger than 5 MB.", variant: "destructive" });
      return;
    }
    setFile(selected);
    onPendingChange(true);
  };

  const upload = async () => {
    if (!file) return;
    const extension = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
    setUploading(true);
    onUploadingChange(true);
    let result: Awaited<ReturnType<ReturnType<typeof apiClient.storage.from>["upload"]>>;
    try {
      result = await apiClient.storage.from(bucket).upload(`${crypto.randomUUID()}.${extension}`, file);
    } finally {
      setUploading(false);
      onUploadingChange(false);
    }

    const { data, error } = result;
    if (error || typeof data?.url !== "string" || !data.url) {
      toast({
        title: "Image upload failed",
        description: error?.message || "The storage service returned no image URL.",
        variant: "destructive",
      });
      return;
    }

    onChange(data.url);
    setFile(null);
    onPendingChange(false);
    toast({ title: "Image uploaded", description: "Save the form to apply this image." });
  };

  return (
    <div className="grid gap-2">
      <Input
        type="url"
        placeholder={`${label} URL`}
        value={value}
        onChange={(event) => {
          setFile(null);
          onPendingChange(false);
          onChange(event.target.value);
        }}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="max-w-sm"
          disabled={uploading}
          onChange={(event) => handleFile(event.currentTarget.files?.[0])}
        />
        <Button type="button" variant="outline" onClick={() => void upload()} disabled={!file || uploading}>
          {uploading ? "Uploading…" : "Upload selected image"}
        </Button>
      </div>
      {preview && (
        <Image
          src={preview}
          alt={`${label} preview`}
          width={128}
          height={128}
          unoptimized
          className="h-32 w-32 rounded-md border object-cover"
        />
      )}
      <p className="text-xs text-muted-foreground">Use an image URL or upload a JPEG, PNG, or WebP file (max 5 MB).</p>
    </div>
  );
};

export default ImageUploadField;
