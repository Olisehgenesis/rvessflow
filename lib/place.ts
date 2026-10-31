const COUNTRY_CURRENCY: Record<string, string> = {
  US: "usd",
  UG: "ugx",
  NG: "ngn",
  KE: "kes",
  GH: "ghs",
  ZA: "zar",
  EG: "egp",
  IN: "inr",
  GB: "gbp",
  CA: "cad",
  AU: "aud",
  JP: "jpy",
  BR: "brl",
  MX: "mxn",
  AE: "aed",
  AT: "eur",
  BE: "eur",
  CY: "eur",
  DE: "eur",
  EE: "eur",
  ES: "eur",
  FI: "eur",
  FR: "eur",
  GR: "eur",
  HR: "eur",
  IE: "eur",
  IT: "eur",
  LT: "eur",
  LU: "eur",
  LV: "eur",
  MT: "eur",
  NL: "eur",
  PT: "eur",
  SI: "eur",
  SK: "eur",
};

export function currencyForCountry(country: string | null | undefined): string | null {
  if (!country) return null;
  return COUNTRY_CURRENCY[country.trim().toUpperCase()] ?? null;
}

const CURRENCY_COUNTRY: Record<string, string> = {
  ugx: "UG",
  ngn: "NG",
  kes: "KE",
  ghs: "GH",
  zar: "ZA",
  egp: "EG",
  inr: "IN",
  brl: "BR",
  mxn: "MX",
  aed: "AE",
};

export function countryForCurrency(code: string | null | undefined): string | null {
  if (!code) return null;
  return CURRENCY_COUNTRY[code.trim().toLowerCase()] ?? null;
}
