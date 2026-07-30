export const supportedLocales = ["en-US", "pt-BR", "es-ES"] as const;

export type SupportedLocale = (typeof supportedLocales)[number];

export const defaultLocale: SupportedLocale = "en-US";

export function formatMoney(
  amountMinor: number,
  currency: string,
  locale: SupportedLocale = defaultLocale,
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}

export function formatVenueTime(
  value: string | Date,
  timezone: string,
  locale: SupportedLocale = defaultLocale,
  options: Intl.DateTimeFormatOptions = {},
): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    ...options,
  }).format(new Date(value));
}
