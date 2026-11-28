/**
 * Form rules with no React in them (tested in `form-core.test.ts`): money
 * text that formats without fighting the caret, character limits, and the
 * field errors a form shows.
 */
import type { FieldErrors } from "../interactions/errors";

export interface MoneyFormat {
  /** Digits after the decimal point: 2 for USD and EUR, 0 for JPY. */
  decimals?: number;
}

export interface Edited {
  text: string;
  caret: number;
}

/**
 * Keeps what a money field can hold (digits, one decimal point, at most
 * `decimals` after it) and moves the caret with the characters it keeps, so
 * typing a letter or a comma never throws the caret to the end. Grouping is
 * added on blur, never while typing.
 */
export function sanitizeMoney(
  text: string,
  caret: number,
  { decimals = 2 }: MoneyFormat = {},
): Edited {
  let out = "";
  let outCaret = 0;
  let seenPoint = false;
  let fraction = 0;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    let keep = false;
    if (character >= "0" && character <= "9") {
      if (!seenPoint || fraction < decimals) {
        keep = true;
        if (seenPoint) fraction += 1;
      }
    } else if (character === "." && !seenPoint && decimals > 0) {
      keep = true;
      seenPoint = true;
    }
    if (keep) {
      out += character;
      if (index < caret) outCaret += 1;
    }
  }
  return { text: out, caret: outCaret };
}

/** The amount in minor units (cents), or null when the field is empty or unreadable. */
export function parseMoneyMinor(
  text: string,
  { decimals = 2 }: MoneyFormat = {},
): number | null {
  const clean = text.replaceAll(/[^0-9.]/g, "");
  if (clean === "" || clean === ".") return null;
  const [whole = "", part = ""] = clean.split(".");
  const fraction = (part + "0".repeat(decimals)).slice(0, decimals);
  const minor = Number(`${whole || "0"}${fraction}`);
  return Number.isSafeInteger(minor) ? minor : null;
}

/** Minor units as the field shows them at rest: grouped, with every decimal. */
export function formatMoneyInput(
  minor: number | null,
  { decimals = 2, locale = "en-US" }: MoneyFormat & { locale?: string } = {},
): string {
  if (minor === null) return "";
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: true,
  }).format(minor / 10 ** decimals);
}

/** Minor units as the field shows them while editing: no grouping. */
export function editableMoney(
  minor: number | null,
  { decimals = 2 }: MoneyFormat = {},
): string {
  if (minor === null) return "";
  return (minor / 10 ** decimals).toFixed(decimals);
}

/** The symbol for a currency in a locale: "$", "€", "£". */
export function currencySymbol(currency: string, locale = "en-US"): string {
  const parts = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).formatToParts(0);
  return parts.find((part) => part.type === "currency")?.value ?? currency;
}

export interface CharacterCount {
  count: number;
  remaining: number;
  over: boolean;
  /** Close enough to the limit to announce. */
  near: boolean;
}

/** Counts by what a person sees as characters (an emoji is one). */
export function characterCount(text: string, max: number): CharacterCount {
  const count = [...new Intl.Segmenter().segment(text)].length;
  const remaining = max - count;
  return {
    count,
    remaining,
    over: remaining < 0,
    near: remaining <= Math.max(10, Math.round(max * 0.1)),
  };
}

/** Drops empty messages, so `{ email: undefined }` means "no error". */
export function cleanErrors(
  errors: Record<string, string | undefined | null | false>,
): FieldErrors {
  const out: FieldErrors = {};
  for (const [name, message] of Object.entries(errors)) {
    if (message) out[name] = message;
  }
  return out;
}

/** Client errors and server errors together; the server's word wins for a field. */
export function mergeErrors(
  client: FieldErrors,
  server: FieldErrors,
): FieldErrors {
  return { ...client, ...server };
}

/** "2 fields need attention", for the announcement after a failed submit. */
export function errorSummary(errors: FieldErrors): string {
  const count = Object.keys(errors).length;
  if (count === 0) return "";
  return count === 1
    ? "1 field needs attention."
    : `${count} fields need attention.`;
}
