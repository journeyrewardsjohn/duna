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
  const hasExplicitPresentation = [
    "dateStyle",
    "timeStyle",
    "weekday",
    "era",
    "year",
    "month",
    "day",
    "dayPeriod",
    "hour",
    "minute",
    "second",
    "fractionalSecondDigits",
    "timeZoneName",
  ].some(
    (key) => options[key as keyof Intl.DateTimeFormatOptions] !== undefined,
  );
  return new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    ...(hasExplicitPresentation
      ? {}
      : {
          month: "short" as const,
          day: "numeric" as const,
          hour: "numeric" as const,
          minute: "2-digit" as const,
        }),
    ...options,
  }).format(new Date(value));
}
