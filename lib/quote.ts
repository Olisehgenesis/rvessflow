export type Quote = {
  code: string;
  unit: string;
  perToken: number;
  digits: number;
  note: string;
};

export const CURRENCIES = [
  { code: "fusdcx", label: "USD", country: "On chain" },
  { code: "usd", label: "USD", country: "United States" },
  { code: "eur", label: "EUR", country: "Euro area" },
  { code: "gbp", label: "GBP", country: "United Kingdom" },
  { code: "ngn", label: "NGN", country: "Nigeria" },
  { code: "kes", label: "KES", country: "Kenya" },
  { code: "ghs", label: "GHS", country: "Ghana" },
  { code: "zar", label: "ZAR", country: "South Africa" },
  { code: "egp", label: "EGP", country: "Egypt" },
  { code: "inr", label: "INR", country: "India" },
  { code: "cad", label: "CAD", country: "Canada" },
  { code: "aud", label: "AUD", country: "Australia" },
  { code: "jpy", label: "JPY", country: "Japan" },
  { code: "brl", label: "BRL", country: "Brazil" },
  { code: "mxn", label: "MXN", country: "Mexico" },
  { code: "aed", label: "AED", country: "United Arab Emirates" },
  { code: "ugx", label: "UGX", country: "Uganda" },
] as const;

export const chainToken = "USD";

export function chainQuote(): Quote {
  return { code: "fusdcx", unit: chainToken, perToken: 1, digits: 2, note: "" };
}

export function currencyByCode(code: string) {
  return CURRENCIES.find((item) => item.code === code) ?? CURRENCIES[0];
}
