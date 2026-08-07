import { alpha3ToAlpha2 } from "i18n-iso-countries";

const iso3ToIso2: Readonly<Record<string, string>> = {
  ALG: "DZ",
  ARG: "AR",
  AUS: "AU",
  AUT: "AT",
  BAH: "BS",
  BAR: "BB",
  BEL: "BE",
  BER: "BM",
  BIZ: "BZ",
  BLR: "BY",
  BOT: "BW",
  BRA: "BR",
  BRN: "BH",
  BUL: "BG",
  CAN: "CA",
  CHI: "CL",
  CHN: "CN",
  CGO: "CG",
  COL: "CO",
  CRC: "CR",
  CRO: "HR",
  CYP: "CY",
  CZE: "CZ",
  DEN: "DK",
  DOM: "DO",
  ECU: "EC",
  EGY: "EG",
  ESA: "SV",
  ENG: "GB",
  ESP: "ES",
  EST: "EE",
  FIJ: "FJ",
  FIN: "FI",
  FRA: "FR",
  GAM: "GM",
  GEO: "GE",
  GBR: "GB",
  GER: "DE",
  GRE: "GR",
  GUA: "GT",
  HAI: "HT",
  HKG: "HK",
  HON: "HN",
  INA: "ID",
  ISR: "IL",
  ISV: "VI",
  ITA: "IT",
  JPN: "JP",
  KSA: "SA",
  KUW: "KW",
  LAT: "LV",
  LBA: "LY",
  LTU: "LT",
  MAD: "MG",
  MAR: "MA",
  MAS: "MY",
  MEX: "MX",
  MRI: "MU",
  MYA: "MM",
  NCA: "NI",
  NED: "NL",
  NOR: "NO",
  NZL: "NZ",
  OMA: "OM",
  PAR: "PY",
  PER: "PE",
  PHI: "PH",
  PLE: "PS",
  POL: "PL",
  POR: "PT",
  PUR: "PR",
  QAT: "QA",
  ROU: "RO",
  RSA: "ZA",
  SAM: "WS",
  SEY: "SC",
  SLO: "SI",
  SVK: "SK",
  SRB: "RS",
  SRI: "LK",
  SUI: "CH",
  SWE: "SE",
  TPE: "TW",
  TUR: "TR",
  UAE: "AE",
  UKR: "UA",
  URU: "UY",
  USA: "US",
  VAN: "VU",
  VEN: "VE",
  VIE: "VN",
  ZIM: "ZW",
};

export function countryCode(value?: string): string | undefined {
  if (!value) return undefined;
  const upper = value.trim().toUpperCase();
  const iso2 =
    upper.length === 2 ? upper : (iso3ToIso2[upper] ?? alpha3ToAlpha2(upper));
  return iso2 && /^[A-Z]{2}$/.test(iso2) ? iso2 : undefined;
}

export function countryName(value?: string): string | undefined {
  const normalized = countryCode(value);
  if (!normalized) return undefined;
  return new Intl.DisplayNames(["en"], { type: "region" }).of(normalized);
}

/** @deprecated Use the ISO-code chip. Emoji flags are intentionally retired. */
export function countryFlag(value?: string): string {
  return countryCode(value) ?? "INTL";
}
