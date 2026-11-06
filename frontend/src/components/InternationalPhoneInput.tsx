"use client";

import { useEffect, useRef } from "react";
import intlTelInput, { type Iti } from "intl-tel-input";
import "intl-tel-input/styles";
import { cn } from "@/lib/utils";

type InternationalPhoneInputProps = {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  name?: string;
  placeholder?: string;
  className?: string;
};

/** A country-aware phone field. `value` is always the complete E.164 number. */
export function InternationalPhoneInput({ value, onChange, required, name, placeholder = "Phone number", className }: InternationalPhoneInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const instanceRef = useRef<Iti | null>(null);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;

    const iti = intlTelInput(input, {
      initialCountry: "in",
      separateDialCode: true,
      formatAsYouType: true,
      strictMode: true,
      loadUtils: () => import("intl-tel-input/utils"),
    });
    instanceRef.current = iti;

    const syncValue = () => {
      const number = iti.getNumber();
      input.setCustomValidity(number && !iti.isValidNumber() ? "Enter a valid phone number for the selected country." : "");
      onChange(number);
    };
    input.addEventListener("input", syncValue);
    input.addEventListener("countrychange", syncValue);
    if (value) iti.setNumber(value);

    return () => {
      input.removeEventListener("input", syncValue);
      input.removeEventListener("countrychange", syncValue);
      iti.destroy();
      instanceRef.current = null;
    };
  // The plugin owns this DOM input after initialization.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const iti = instanceRef.current;
    if (iti && value && iti.getNumber() !== value) iti.setNumber(value);
  }, [value]);

  return (
    <input
      ref={inputRef}
      name={name}
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      required={required}
      placeholder={placeholder}
      className={cn(
        "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:text-sm",
        className,
      )}
    />
  );
}
