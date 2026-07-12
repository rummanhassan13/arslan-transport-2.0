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
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

const clientSelect = "id, organization_id, name, contact_person, phone, email, address, notes, status, created_at, updated_at, deleted_at";

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
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function toClientPayload(input: ClientInput | ClientUpdateInput) {
  return {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.contactPerson !== undefined ? { contact_person: input.contactPerson } : {}),
    ...(input.phone !== undefined ? { phone: input.phone } : {}),
    ...(input.email !== undefined ? { email: input.email } : {}),
    ...(input.address !== undefined ? { address: input.address } : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
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

  const { data, error } = await supabase
    .from("clients")
    .select(clientSelect)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .order("name", { ascending: true });

  if (error) throw new Error(`Unable to load clients: ${error.message}`);
  return ((data ?? []) as ClientRow[]).map(toClient);
}

export async function createClient(organizationId: string, input: ClientInput): Promise<Client> {
  const supabase = requireSupabaseClient();
  const userId = await getCurrentUserId();

  const { data, error } = await supabase
    .from("clients")
    .insert({
      ...toClientPayload({ ...input, status: input.status ?? "active" }),
      organization_id: organizationId,
      created_by: userId,
      updated_by: userId,
    })
    .select(clientSelect)
    .single();

  if (error) throw new Error(`Unable to create client: ${error.message}`);
  return toClient(data as ClientRow);
}

export async function updateClient(organizationId: string, clientId: string, input: ClientUpdateInput): Promise<Client> {
  const supabase = requireSupabaseClient();
  const userId = await getCurrentUserId();

  const { data, error } = await supabase
    .from("clients")
    .update({
      ...toClientPayload(input),
      updated_by: userId,
    })
    .eq("id", clientId)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .select(clientSelect)
    .single();

  if (error) throw new Error(`Unable to update client: ${error.message}`);
  return toClient(data as ClientRow);
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

  if (error) throw new Error(`Unable to delete client: ${error.message}`);
}
