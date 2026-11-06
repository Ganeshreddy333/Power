import { isValidPhoneNumber } from "libphonenumber-js";

/** E.164 validation for values emitted by InternationalPhoneInput. */
export const isValidInternationalPhoneNumber = (value: string) =>
  value.startsWith("+") && isValidPhoneNumber(value);
