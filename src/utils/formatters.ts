import { DEFAULT_CURRENCY_CODE, getCurrencyOption, isCurrencyCode, type CurrencyCode } from "../constants/currencies";

const CURRENCY_STORAGE_KEY = "transportflow_currency";
let activeCurrencyCode: CurrencyCode = getInitialCurrencyCode();

function getInitialCurrencyCode(): CurrencyCode {
  if (typeof window === "undefined") return DEFAULT_CURRENCY_CODE;
  const stored = window.localStorage.getItem(CURRENCY_STORAGE_KEY);
  return isCurrencyCode(stored) ? stored : DEFAULT_CURRENCY_CODE;
}

export function getStoredCurrencyCode(): CurrencyCode {
  return activeCurrencyCode;
}

export function setStoredCurrencyCode(code: CurrencyCode) {
  activeCurrencyCode = code;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(CURRENCY_STORAGE_KEY, code);
  }
}

export function formatCurrency(value: number | null | undefined, currencyCode: CurrencyCode = activeCurrencyCode) {
  const amount = Number.isFinite(Number(value)) ? Number(value) : 0;
  const currency = getCurrencyOption(currencyCode);

  try {
    return new Intl.NumberFormat(currency.locale, {
      style: "currency",
      currency: currency.code,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency.code} ${amount.toLocaleString("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })}`;
  }
}

export function money(value: number | null | undefined) {
  return formatCurrency(value, activeCurrencyCode);
}

export function formatDate(date: string) {
  return new Date(date).toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" });
}

export function labelize(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (letter) => letter.toUpperCase());
}

export function groupBy<T>(items: T[], key: keyof T | ((item: T) => string)) {
  const map = new Map<string, T[]>();
  items.forEach((item) => {
    const value = typeof key === "function" ? key(item) : String(item[key]);
    map.set(value, [...(map.get(value) || []), item]);
  });
  return Array.from(map.entries());
}

export function unique<T>(items: T[], key: keyof T) {
  return Array.from(new Set(items.map((item) => String(item[key]))));
}

export function uniqueByValues(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}
