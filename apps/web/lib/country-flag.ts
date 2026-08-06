const iso3ToIso2: Readonly<Record<string, string>> = {
  ARG: "AR",
  AUS: "AU",
  AUT: "AT",
  BEL: "BE",
  BLR: "BY",
  BRA: "BR",
  CAN: "CA",
  CHI: "CL",
  CHN: "CN",
  COL: "CO",
  CZE: "CZ",
  DEN: "DK",
  EGY: "EG",
  ENG: "GB",
  ESP: "ES",
  EST: "EE",
  FIN: "FI",
  FRA: "FR",
  GBR: "GB",
  GER: "DE",
  GRE: "GR",
  ISR: "IL",
  ITA: "IT",
  JPN: "JP",
  LAT: "LV",
  LTU: "LT",
  MEX: "MX",
  NED: "NL",
  NOR: "NO",
  NZL: "NZ",
  POL: "PL",
  POR: "PT",
  QAT: "QA",
  RSA: "ZA",
  SLO: "SI",
  SVK: "SK",
  SRB: "RS",
  SUI: "CH",
  SWE: "SE",
  TUR: "TR",
  UKR: "UA",
  USA: "US",
};

export function countryCode(value?: string): string | undefined {
  if (!value) return undefined;
  const upper = value.trim().toUpperCase();
  const iso2 = upper.length === 2 ? upper : iso3ToIso2[upper];
  return iso2 && /^[A-Z]{2}$/.test(iso2) ? iso2 : undefined;
}

/** @deprecated Use the ISO-code chip. Emoji flags are intentionally retired. */
export function countryFlag(value?: string): string {
  return countryCode(value) ?? "INTL";
}
