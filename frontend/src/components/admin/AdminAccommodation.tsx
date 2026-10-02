"use client";

import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/integrations/api/client";
import type { AccommodationOption } from "@/integrations/api/types";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type AccommodationForm = {
  name: string;
  description: string;
  price_per_night: string;
  available_from: string;
  available_until: string;
  minimum_nights: string;
  maximum_nights: string;
  capacity: string;
  allow_outside_conference_dates: boolean;
  is_active: boolean;
};

const emptyForm: AccommodationForm = {
  name: "",
  description: "",
  price_per_night: "",
  available_from: "",
  available_until: "",
  minimum_nights: "1",
  maximum_nights: "",
  capacity: "",
  allow_outside_conference_dates: false,
  is_active: true,
};

const isEnabled = (value: unknown) => value === true || value === 1 || value === "1" || value === "true";

const AdminAccommodation = () => {
  const [options, setOptions] = useState<AccommodationOption[]>([]);
  const [form, setForm] = useState<AccommodationForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const fetchOptions = useCallback(async () => {
    const { data, error } = await apiClient.from("accommodation_options").select("*").order("name");
    if (error) {
      toast({ title: "Could not load accommodations", description: error.message, variant: "destructive" });
      return;
    }
    setOptions(data ?? []);
  }, [toast]);

  useEffect(() => {
    void fetchOptions();
  }, [fetchOptions]);

  const reset = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const save = async () => {
    const price = Number(form.price_per_night);
    const minimum = Number(form.minimum_nights);
    const maximum = form.maximum_nights ? Number(form.maximum_nights) : null;
    const capacity = form.capacity ? Number(form.capacity) : null;
    if (!form.name.trim() || !Number.isFinite(price) || price <= 0 ||
        !Number.isInteger(minimum) || minimum < 1 ||
        (maximum !== null && (!Number.isInteger(maximum) || maximum < minimum)) ||
        (capacity !== null && (!Number.isInteger(capacity) || capacity < 1)) ||
        (form.available_from && form.available_until && form.available_from >= form.available_until)) {
      toast({ title: "Check accommodation details", description: "Enter a name, positive USD nightly price, valid stay limits/capacity, and an end date after the start date.", variant: "destructive" });
      return;
    }

    setSaving(true);
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      price_per_night: price,
      currency: "USD",
      available_from: form.available_from || null,
      available_until: form.available_until || null,
      minimum_nights: minimum,
      maximum_nights: maximum,
      capacity,
      allow_outside_conference_dates: form.allow_outside_conference_dates,
      is_active: form.is_active,
    };
    const { error } = editingId
      ? await apiClient.from("accommodation_options").update(payload).eq("id", editingId)
      : await apiClient.from("accommodation_options").insert(payload);
    setSaving(false);
    if (error) {
      toast({ title: "Could not save accommodation", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: editingId ? "Accommodation updated" : "Accommodation created" });
    reset();
    await fetchOptions();
  };

  const edit = (option: AccommodationOption) => {
    setEditingId(option.id);
    setForm({
      name: option.name,
      description: option.description ?? "",
      price_per_night: String(option.price_per_night),
      available_from: option.available_from?.slice(0, 10) ?? "",
      available_until: option.available_until?.slice(0, 10) ?? "",
      minimum_nights: String(option.minimum_nights),
      maximum_nights: option.maximum_nights == null ? "" : String(option.maximum_nights),
      capacity: option.capacity == null ? "" : String(option.capacity),
      allow_outside_conference_dates: isEnabled(option.allow_outside_conference_dates),
      is_active: isEnabled(option.is_active),
    });
  };

  const deactivate = async (option: AccommodationOption) => {
    const { error } = await apiClient.from("accommodation_options").update({ is_active: false }).eq("id", option.id);
    if (error) {
      toast({ title: "Could not deactivate accommodation", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Accommodation deactivated" });
    await fetchOptions();
  };

  const update = (key: keyof AccommodationForm, value: string | boolean) =>
    setForm((current) => ({ ...current, [key]: value }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display">Manage Accommodation</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <label className="space-y-1 text-sm font-medium">Name<Input value={form.name} onChange={(event) => update("name", event.target.value)} /></label>
          <label className="space-y-1 text-sm font-medium">Price per night (USD)<Input type="number" min="0.01" step="0.01" value={form.price_per_night} onChange={(event) => update("price_per_night", event.target.value)} /></label>
          <label className="space-y-1 text-sm font-medium">Capacity (rooms; blank is unlimited)<Input type="number" min="1" step="1" value={form.capacity} onChange={(event) => update("capacity", event.target.value)} /></label>
          <label className="space-y-1 text-sm font-medium">Available from<Input type="date" value={form.available_from} onChange={(event) => update("available_from", event.target.value)} /></label>
          <label className="space-y-1 text-sm font-medium">Available until (checkout date)<Input type="date" value={form.available_until} onChange={(event) => update("available_until", event.target.value)} /></label>
          <label className="space-y-1 text-sm font-medium">Minimum nights<Input type="number" min="1" step="1" value={form.minimum_nights} onChange={(event) => update("minimum_nights", event.target.value)} /></label>
          <label className="space-y-1 text-sm font-medium">Maximum nights (blank is unlimited)<Input type="number" min="1" step="1" value={form.maximum_nights} onChange={(event) => update("maximum_nights", event.target.value)} /></label>
          <label className="space-y-1 text-sm font-medium md:col-span-2">Description<Textarea value={form.description} onChange={(event) => update("description", event.target.value)} /></label>
        </div>
        <div className="flex flex-wrap gap-6 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.allow_outside_conference_dates} onChange={(event) => update("allow_outside_conference_dates", event.target.checked)} /> Allow stays outside conference dates</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.is_active} onChange={(event) => update("is_active", event.target.checked)} /> Available to registrants</label>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => void save()} disabled={saving}>{saving ? "Saving…" : editingId ? "Save changes" : "Add accommodation"}</Button>
          {editingId && <Button type="button" variant="outline" onClick={reset}>Cancel edit</Button>}
        </div>
        <div className="divide-y rounded-md border">
          {options.map((option) => (
            <div key={option.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-semibold">{option.name} {!option.is_active && <span className="text-xs text-muted-foreground">(inactive)</span>}</p>
                <p className="text-sm text-muted-foreground">
                  ${Number(option.price_per_night).toFixed(2)} / night · {option.capacity == null ? "unlimited rooms" : `${option.capacity} rooms`} · {option.minimum_nights} min nights
                </p>
              </div>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => edit(option)}>Edit</Button>
                {option.is_active && <Button type="button" size="sm" variant="destructive" onClick={() => void deactivate(option)}>Deactivate</Button>}
              </div>
            </div>
          ))}
          {!options.length && <p className="p-4 text-sm text-muted-foreground">No accommodation options configured.</p>}
        </div>
      </CardContent>
    </Card>
  );
};

export default AdminAccommodation;
