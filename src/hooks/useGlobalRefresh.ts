import { useEffect } from "react";

export const GLOBAL_REFRESH_EVENT = "transportflow:global-refresh";
export type RefreshScope = "clients" | "drivers" | "shipments" | "payments" | "expenses" | "invoices" | "vehicles" | "truckTypes" | "routes";

export function notifyGlobalRefresh(scope?: RefreshScope | RefreshScope[]) {
  if (typeof window !== "undefined") {
    const scopes = scope ? (Array.isArray(scope) ? scope : [scope]) : [];
    window.dispatchEvent(new CustomEvent(GLOBAL_REFRESH_EVENT, { detail: { scopes } }));
  }
}

export function useGlobalRefresh(callback: () => void, scope: RefreshScope) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (event: Event) => {
      const scopes = (event as CustomEvent<{ scopes?: RefreshScope[] }>).detail?.scopes ?? [];
      if (!scopes.length || scopes.includes(scope)) callback();
    };
    window.addEventListener(GLOBAL_REFRESH_EVENT, handler);
    return () => window.removeEventListener(GLOBAL_REFRESH_EVENT, handler);
  }, [callback, scope]);
}
