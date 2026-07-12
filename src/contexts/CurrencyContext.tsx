import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { CURRENCIES, getCurrencyOption, type CurrencyCode } from "../constants/currencies";
import { formatCurrency, getStoredCurrencyCode, setStoredCurrencyCode } from "../utils/formatters";

type CurrencyContextValue = {
  currencyCode: CurrencyCode;
  currency: ReturnType<typeof getCurrencyOption>;
  currencies: typeof CURRENCIES;
  setCurrencyCode: (code: CurrencyCode) => void;
  formatMoney: (value: number | null | undefined) => string;
};

const CurrencyContext = createContext<CurrencyContextValue | undefined>(undefined);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currencyCode, setCurrencyCodeState] = useState<CurrencyCode>(() => getStoredCurrencyCode());

  const setCurrencyCode = useCallback((code: CurrencyCode) => {
    setStoredCurrencyCode(code);
    setCurrencyCodeState(code);
  }, []);

  const value = useMemo<CurrencyContextValue>(() => {
    const currency = getCurrencyOption(currencyCode);
    return {
      currencyCode,
      currency,
      currencies: CURRENCIES,
      setCurrencyCode,
      formatMoney: (amount) => formatCurrency(amount, currencyCode),
    };
  }, [currencyCode, setCurrencyCode]);

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrencyContext() {
  const context = useContext(CurrencyContext);
  if (!context) {
    throw new Error("useCurrencyContext must be used inside CurrencyProvider");
  }

  return context;
}
