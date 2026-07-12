import { requireSupabaseClient } from "../lib/supabase";
import type { CompanyProfileSettings, InvoiceSettings } from "../contexts/BusinessSettingsContext";

type SettingsRow = {
  organization_id: string;
  invoice_prefix: string;
  next_invoice_number: number;
  invoice_due_days: number;
  invoice_footer_notes: string | null;
  company_profile: Partial<CompanyProfileSettings> | null;
};

const settingsSelect = "organization_id, invoice_prefix, next_invoice_number, invoice_due_days, invoice_footer_notes, company_profile";

export type OrganizationBusinessSettings = {
  company: CompanyProfileSettings;
  invoice: InvoiceSettings;
};

function termLabel(days: number) {
  return days === 0 ? "Due on receipt" : `${days} days`;
}

export function parseDueDays(value: string) {
  if (value.toLowerCase().includes("receipt")) return 0;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 15;
}

export async function getOrganizationBusinessSettings(
  organizationId: string,
  defaults: OrganizationBusinessSettings,
): Promise<OrganizationBusinessSettings> {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase
    .from("settings")
    .select(settingsSelect)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw new Error(`Unable to load organization settings: ${error.message}`);
  if (!data) return defaults;
  const row = data as SettingsRow;
  return {
    company: { ...defaults.company, ...(row.company_profile ?? {}) },
    invoice: {
      ...defaults.invoice,
      invoicePrefix: row.invoice_prefix,
      startingInvoiceNumber: String(row.next_invoice_number),
      dueDateTerms: termLabel(row.invoice_due_days),
      footerNotes: row.invoice_footer_notes ?? defaults.invoice.footerNotes,
      defaultInvoiceStatus: "Draft",
    },
  };
}

export async function saveOrganizationBusinessSettings(
  organizationId: string,
  settings: OrganizationBusinessSettings,
): Promise<void> {
  const supabase = requireSupabaseClient();
  const nextNumber = Number.parseInt(settings.invoice.startingInvoiceNumber, 10);
  if (!Number.isFinite(nextNumber) || nextNumber <= 0) throw new Error("Starting invoice number must be greater than zero.");
  const { error } = await supabase.from("settings").upsert({
    organization_id: organizationId,
    invoice_prefix: settings.invoice.invoicePrefix,
    next_invoice_number: nextNumber,
    invoice_due_days: parseDueDays(settings.invoice.dueDateTerms),
    invoice_footer_notes: settings.invoice.footerNotes || null,
    company_profile: settings.company,
  }, { onConflict: "organization_id" });
  if (error) throw new Error(`Unable to save organization settings: ${error.message}`);
}

