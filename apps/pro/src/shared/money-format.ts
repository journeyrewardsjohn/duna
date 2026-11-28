/**
 * Money in words and figures for Pro (M-R4). Pure and unit-tested
 * (`money-format.test.ts`). Figures are drawn in Geist Mono by the screens;
 * this file only decides the characters.
 */

/** "$1,234.50" (whole amounts keep their cents: money is never rounded). */
export function formatMoney(
  amountMinor: number,
  currency: string,
  locale = "en-US",
): string {
  const safe = Number.isFinite(amountMinor) ? Math.round(amountMinor) : 0;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safe / 100);
}

/** "+$12.00" / "−$3.00" (a true minus sign) / "$0.00". */
export function formatSignedMoney(
  amountMinor: number,
  currency: string,
  locale = "en-US",
): string {
  if (amountMinor === 0) return formatMoney(0, currency, locale);
  const body = formatMoney(Math.abs(amountMinor), currency, locale);
  return amountMinor > 0 ? `+${body}` : `−${body}`;
}

/** "Thu, Dec 4" in the club's time zone. */
export function formatMoneyDate(
  iso: string,
  timeZone?: string,
  locale = "en-US",
): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
}

/** "3 credits" / "1 credit". */
export function formatCredits(count: number): string {
  return `${count} credit${count === 1 ? "" : "s"}`;
}

/**
 * Parses what a person typed into minor units: "50", "$50.5", "1,200.00".
 * Returns null when it is not an amount (never guesses).
 */
export function parseAmountMinor(value: string): number | null {
  const cleaned = value.replace(/[\s,$]/g, "");
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  const [whole, cents = ""] = cleaned.split(".");
  return Number(whole) * 100 + Number(cents.padEnd(2, "0") || "0");
}
