import { useCurrencyContext } from "../contexts/CurrencyContext";

export function useCurrency() {
  return useCurrencyContext();
}
