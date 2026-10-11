export const normalizePhoneNumber = (value: string) => value.replace(/\D/g, "").slice(0, 10);

export const isTenDigitPhoneNumber = (value: string) => /^\d{10}$/.test(value);
