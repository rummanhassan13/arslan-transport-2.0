import { requireSupabaseClient } from "../lib/supabase";
import type { Client, ClientInput, ClientUpdateInput } from "../types/domain";

type ClientRow = {
  id: string;
  organization_id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  invoice_company_name: string | null;
  trn: string | null;
  show_iban_on_invoice: boolean;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

const baseClientSelect = "id, organization_id, name, contact_person, phone, email, address, notes, status, created_at, updated_at, deleted_at";
const clientSelect = baseClientSelect.replace("notes,", "notes, invoice_company_name, trn, show_iban_on_invoice,");

// Until migration 020 (invoice_company_name, trn, show_iban_on_invoice) is applied, the app keeps working without those columns.
const CLIENT_TIERS = [
  { select: clientSelect, invoiceDetails: true },
  { select: baseClientSelect, invoiceDetails: false },
] as const;

function isMissingInvoiceDetailsColumnError(error: { message?: string; details?: string; hint?: string } | null) {
  const text = [error?.message, error?.details, error?.hint].filter(Boolean).join(" ").toLowerCase();
  return text.includes("invoice_company_name") || text.includes("show_iban_on_invoice") || /\btrn\b/.test(text);
}

function toClient(row: ClientRow): Client {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    contactPerson: row.contact_person,
    phone: row.phone,
    email: row.email,
    address: row.address,
    notes: row.notes,
    invoiceCompanyName: row.invoice_company_name ?? null,
    trn: row.trn ?? null,
    showIbanOnInvoice: row.show_iban_on_invoice ?? false,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function toClientPayload(input: ClientInput | ClientUpdateInput, includeInvoiceDetails = true) {
  return {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.contactPerson !== undefined ? { contact_person: input.contactPerson } : {}),
    ...(input.phone !== undefined ? { phone: input.phone } : {}),
    ...(input.email !== undefined ? { email: input.email } : {}),
    ...(input.address !== undefined ? { address: input.address } : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
    ...(includeInvoiceDetails && input.invoiceCompanyName !== undefined ? { invoice_company_name: input.invoiceCompanyName } : {}),
    ...(includeInvoiceDetails && input.trn !== undefined ? { trn: input.trn } : {}),
    ...(includeInvoiceDetails && input.showIbanOnInvoice !== undefined ? { show_iban_on_invoice: input.showIbanOnInvoice } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
  };
}

async function getCurrentUserId() {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw new Error(`Unable to read current user: ${error.message}`);
  return data.user?.id ?? null;
}

export async function listClients(organizationId: string): Promise<Client[]> {
  const supabase = requireSupabaseClient();

  const query = (select: string) => supabase
    .from("clients")
    .select(select)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .order("name", { ascending: true });

  let { data, error } = await query(CLIENT_TIERS[0].select);
  if (error && isMissingInvoiceDetailsColumnError(error)) ({ data, error } = await query(CLIENT_TIERS[1].select));

  if (error) throw new Error(`Unable to load companies: ${error.message}`);
  return ((data ?? []) as unknown as ClientRow[]).map(toClient);
}

export async function createClient(organizationId: string, input: ClientInput): Promise<Client> {
  const supabase = requireSupabaseClient();
  const userId = await getCurrentUserId();

  const insertWith = (tier: (typeof CLIENT_TIERS)[number]) => supabase
    .from("clients")
    .insert({
      ...toClientPayload({ ...input, status: input.status ?? "active" }, tier.invoiceDetails),
      organization_id: organizationId,
      created_by: userId,
      updated_by: userId,
    })
    .select(tier.select)
    .single();

  let { data, error } = await insertWith(CLIENT_TIERS[0]);
  if (error && isMissingInvoiceDetailsColumnError(error)) ({ data, error } = await insertWith(CLIENT_TIERS[1]));

  if (error) throw new Error(`Unable to create company: ${error.message}`);
  return toClient(data as unknown as ClientRow);
}

export async function updateClient(organizationId: string, clientId: string, input: ClientUpdateInput): Promise<Client> {
  const supabase = requireSupabaseClient();
  const userId = await getCurrentUserId();

  const updateWith = (tier: (typeof CLIENT_TIERS)[number]) => supabase
    .from("clients")
    .update({
      ...toClientPayload(input, tier.invoiceDetails),
      updated_by: userId,
    })
    .eq("id", clientId)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .select(tier.select)
    .single();

  let { data, error } = await updateWith(CLIENT_TIERS[0]);
  if (error && isMissingInvoiceDetailsColumnError(error)) ({ data, error } = await updateWith(CLIENT_TIERS[1]));

  if (error) throw new Error(`Unable to update company: ${error.message}`);
  return toClient(data as unknown as ClientRow);
}

export async function softDeleteClient(organizationId: string, clientId: string): Promise<void> {
  const supabase = requireSupabaseClient();
  const userId = await getCurrentUserId();

  const { error } = await supabase
    .from("clients")
    .update({
      deleted_at: new Date().toISOString(),
      updated_by: userId,
    })
    .eq("id", clientId)
    .eq("organization_id", organizationId)
    .is("deleted_at", null);

  if (error) throw new Error(`Unable to delete company: ${error.message}`);
}
