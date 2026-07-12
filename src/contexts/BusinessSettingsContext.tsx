import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { env } from "../config/env";
import { getOrganizationBusinessSettings, saveOrganizationBusinessSettings } from "../services/settingsService";
import { useAuth } from "../hooks/useAuth";

const BUSINESS_SETTINGS_STORAGE_KEY = "transportflow_business_settings";

export type CompanyProfileSettings = {
  companyName: string;
  tagline: string;
  phone: string;
  email: string;
  address: string;
  cityCountry: string;
  logoUrl: string;
};

export type InvoiceSettings = {
  invoicePrefix: string;
  startingInvoiceNumber: string;
  dueDateTerms: string;
  footerNotes: string;
  defaultInvoiceStatus: string;
};

export type BusinessSettings = {
  company: CompanyProfileSettings;
  invoice: InvoiceSettings;
};

const defaultBusinessSettings: BusinessSettings = {
  company: {
    companyName: "TransportFlow Logistics",
    tagline: "Professional transport billing demo",
    phone: "",
    email: "",
    address: "",
    cityCountry: "",
    logoUrl: "",
  },
  invoice: {
    invoicePrefix: "AT",
    startingInvoiceNumber: "1001",
    dueDateTerms: "15 days",
    footerNotes: "Payment terms and invoice footer notes will appear here.",
    defaultInvoiceStatus: "Draft",
  },
};

type BusinessSettingsContextValue = {
  settings: BusinessSettings;
  company: CompanyProfileSettings;
  invoice: InvoiceSettings;
  updateCompanyProfile: (input: CompanyProfileSettings) => Promise<void>;
  updateInvoiceSettings: (input: InvoiceSettings) => Promise<void>;
  formatInvoiceNumber: (invoiceReference?: string | null) => string;
  loading: boolean;
  error: string | null;
};

const BusinessSettingsContext = createContext<BusinessSettingsContextValue | undefined>(undefined);

function readStoredSettings(): BusinessSettings {
  if (typeof window === "undefined") return defaultBusinessSettings;
  const stored = window.localStorage.getItem(BUSINESS_SETTINGS_STORAGE_KEY);
  if (!stored) return defaultBusinessSettings;

  try {
    const parsed = JSON.parse(stored) as Partial<BusinessSettings>;
    return {
      company: { ...defaultBusinessSettings.company, ...(parsed.company ?? {}) },
      invoice: { ...defaultBusinessSettings.invoice, ...(parsed.invoice ?? {}) },
    };
  } catch {
    return defaultBusinessSettings;
  }
}

function persistSettings(settings: BusinessSettings) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(BUSINESS_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  }
}

function cleanInvoicePrefix(prefix: string) {
  return (prefix || defaultBusinessSettings.invoice.invoicePrefix)
    .trim()
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase();
}

function extractInvoiceNumber(invoiceReference?: string | null) {
  const match = invoiceReference?.match(/(\d+)\s*$/);
  return match?.[1] ?? "";
}

export function BusinessSettingsProvider({ children }: { children: ReactNode }) {
  const { activeOrganization } = useAuth();
  const [settings, setSettings] = useState<BusinessSettings>(() => readStoredSettings());
  const [loading, setLoading] = useState(!env.demoMode);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (env.demoMode) {
      setLoading(false);
      return;
    }
    if (!activeOrganization) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void getOrganizationBusinessSettings(activeOrganization.id, defaultBusinessSettings)
      .then((next) => {
        if (!cancelled) setSettings(next);
      })
      .catch((settingsError) => {
        if (!cancelled) setError(settingsError instanceof Error ? settingsError.message : "Unable to load settings.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [activeOrganization]);

  const persist = useCallback(async (next: BusinessSettings) => {
    if (env.demoMode) {
      persistSettings(next);
      return;
    }
    if (!activeOrganization) throw new Error("No active organization is available for saving settings.");
    await saveOrganizationBusinessSettings(activeOrganization.id, next);
  }, [activeOrganization]);

  const updateCompanyProfile = useCallback(async (input: CompanyProfileSettings) => {
    const next = { ...settings, company: input };
    setError(null);
    await persist(next);
    setSettings(next);
  }, [persist, settings]);

  const updateInvoiceSettings = useCallback(async (input: InvoiceSettings) => {
    const next = { ...settings, invoice: { ...input, invoicePrefix: cleanInvoicePrefix(input.invoicePrefix) } };
    setError(null);
    await persist(next);
    setSettings(next);
  }, [persist, settings]);

  const formatInvoiceNumber = useCallback(
    (invoiceReference?: string | null) => {
      const number = extractInvoiceNumber(invoiceReference) || settings.invoice.startingInvoiceNumber.trim() || defaultBusinessSettings.invoice.startingInvoiceNumber;
      return number;
    },
    [settings.invoice.startingInvoiceNumber],
  );

  const value = useMemo<BusinessSettingsContextValue>(
    () => ({
      settings,
      company: settings.company,
      invoice: settings.invoice,
      updateCompanyProfile,
      updateInvoiceSettings,
      formatInvoiceNumber,
      loading,
      error,
    }),
    [error, formatInvoiceNumber, loading, settings, updateCompanyProfile, updateInvoiceSettings],
  );

  return <BusinessSettingsContext.Provider value={value}>{children}</BusinessSettingsContext.Provider>;
}

export function useBusinessSettingsContext() {
  const context = useContext(BusinessSettingsContext);
  if (!context) {
    throw new Error("useBusinessSettingsContext must be used inside BusinessSettingsProvider");
  }

  return context;
}
