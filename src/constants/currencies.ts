export type CurrencyCode = "USD" | "AED" | "GBP" | "CAD" | "EUR" | "PKR" | "SAR" | "QAR" | "INR";

export type CurrencyOption = {
  code: CurrencyCode;
  label: string;
  symbol: string;
  locale: string;
};

export const CURRENCIES: CurrencyOption[] = [
  { code: "USD", label: "US Dollar", symbol: "$", locale: "en-US" },
  { code: "AED", label: "UAE Dirham", symbol: "AED", locale: "en-AE" },
  { code: "GBP", label: "British Pound", symbol: "£", locale: "en-GB" },
  { code: "CAD", label: "Canadian Dollar", symbol: "C$", locale: "en-CA" },
  { code: "EUR", label: "Euro", symbol: "€", locale: "en-EU" },
  { code: "PKR", label: "Pakistani Rupee", symbol: "Rs.", locale: "en-PK" },
  { code: "SAR", label: "Saudi Riyal", symbol: "SAR", locale: "en-SA" },
  { code: "QAR", label: "Qatari Riyal", symbol: "QAR", locale: "en-QA" },
  { code: "INR", label: "Indian Rupee", symbol: "₹", locale: "en-IN" },
];

export const DEFAULT_CURRENCY_CODE: CurrencyCode = "PKR";

export function isCurrencyCode(value: string | null | undefined): value is CurrencyCode {
  return CURRENCIES.some((currency) => currency.code === value);
}

export function getCurrencyOption(code: string | null | undefined) {
  return CURRENCIES.find((currency) => currency.code === code) ?? CURRENCIES.find((currency) => currency.code === DEFAULT_CURRENCY_CODE)!;
}
