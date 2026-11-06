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
  row_color?: string | null;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

const baseClientSelect = "id, organization_id, name, contact_person, phone, email, address, notes, status, created_at, updated_at, deleted_at";
const clientSelect = baseClientSelect.replace("notes,", "notes, invoice_company_name, trn, show_iban_on_invoice,");

const colorClientSelect = clientSelect.replace("show_iban_on_invoice,", "show_iban_on_invoice, row_color,");

// Until migrations 023 (row_color) and 020 (invoice_company_name, trn, show_iban_on_invoice)
// are applied, the app keeps working without those columns: each tier drops one set.
const CLIENT_TIERS = [
  { select: colorClientSelect, invoiceDetails: true, rowColor: true },
  { select: clientSelect, invoiceDetails: true, rowColor: false },
  { select: baseClientSelect, invoiceDetails: false, rowColor: false },
] as const;

function isMissingOptionalColumnError(error: { message?: string; details?: string; hint?: string } | null) {
  const text = [error?.message, error?.details, error?.hint].filter(Boolean).join(" ").toLowerCase();
  return text.includes("row_color") || text.includes("invoice_company_name") || text.includes("show_iban_on_invoice") || /\btrn\b/.test(text);
}

/** Runs the request with the fullest column set the database supports. */
async function withClientTiers<T extends { error: { message?: string; details?: string; hint?: string } | null }>(
  run: (tier: (typeof CLIENT_TIERS)[number]) => PromiseLike<T>,
) {
  let result = await run(CLIENT_TIERS[0]);
  for (const tier of CLIENT_TIERS.slice(1)) {
    if (!result.error || !isMissingOptionalColumnError(result.error)) break;
    result = await run(tier);
  }
  return result;
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
    rowColor: row.row_color ?? null,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function toClientPayload(input: ClientInput | ClientUpdateInput, includeInvoiceDetails = true, includeRowColor = true) {
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
    ...(includeRowColor && input.rowColor !== undefined ? { row_color: input.rowColor } : {}),
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

  const { data, error } = await withClientTiers((tier) => query(tier.select));

  if (error) throw new Error(`Unable to load companies: ${error.message}`);
  return ((data ?? []) as unknown as ClientRow[]).map(toClient);
}

export async function createClient(organizationId: string, input: ClientInput): Promise<Client> {
  const supabase = requireSupabaseClient();
  const userId = await getCurrentUserId();

  const insertWith = (tier: (typeof CLIENT_TIERS)[number]) => supabase
    .from("clients")
    .insert({
      ...toClientPayload({ ...input, status: input.status ?? "active" }, tier.invoiceDetails, tier.rowColor),
      organization_id: organizationId,
      created_by: userId,
      updated_by: userId,
    })
    .select(tier.select)
    .single();

  const { data, error } = await withClientTiers(insertWith);

  if (error) throw new Error(`Unable to create company: ${error.message}`);
  return toClient(data as unknown as ClientRow);
}

export async function updateClient(organizationId: string, clientId: string, input: ClientUpdateInput): Promise<Client> {
  const supabase = requireSupabaseClient();
  const userId = await getCurrentUserId();

  const updateWith = (tier: (typeof CLIENT_TIERS)[number]) => supabase
    .from("clients")
    .update({
      ...toClientPayload(input, tier.invoiceDetails, tier.rowColor),
      updated_by: userId,
    })
    .eq("id", clientId)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .select(tier.select)
    .single();

  const { data, error } = await withClientTiers(updateWith);

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
