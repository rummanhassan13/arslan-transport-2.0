import { requireSupabaseClient } from "../lib/supabase";
import type { TruckType, TruckTypeInput, TruckTypeUpdateInput } from "../types/domain";

type TruckTypeRow = {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

const truckTypeSelect = "id, organization_id, name, description, status, created_at, updated_at, deleted_at";

function toTruckType(row: TruckTypeRow): TruckType {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    description: row.description,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function toTruckTypePayload(input: TruckTypeInput | TruckTypeUpdateInput) {
  return {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
  };
}

export async function listTruckTypes(organizationId: string): Promise<TruckType[]> {
  const supabase = requireSupabaseClient();

  const { data, error } = await supabase
    .from("truck_types")
    .select(truckTypeSelect)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .order("name", { ascending: true });

  if (error) throw new Error(`Unable to load truck types: ${error.message}`);
  return ((data ?? []) as TruckTypeRow[]).map(toTruckType);
}

export async function createTruckType(organizationId: string, input: TruckTypeInput): Promise<TruckType> {
  const supabase = requireSupabaseClient();

  const { data, error } = await supabase
    .from("truck_types")
    .insert({
      ...toTruckTypePayload({ ...input, status: input.status ?? "active" }),
      organization_id: organizationId,
    })
    .select(truckTypeSelect)
    .single();

  if (error) throw new Error(`Unable to create truck type: ${error.message}`);
  return toTruckType(data as TruckTypeRow);
}

export async function updateTruckType(organizationId: string, truckTypeId: string, input: TruckTypeUpdateInput): Promise<TruckType> {
  const supabase = requireSupabaseClient();

  const { data, error } = await supabase
    .from("truck_types")
    .update(toTruckTypePayload(input))
    .eq("id", truckTypeId)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .select(truckTypeSelect)
    .single();

  if (error) throw new Error(`Unable to update truck type: ${error.message}`);
  return toTruckType(data as TruckTypeRow);
}

export async function softDeleteTruckType(organizationId: string, truckTypeId: string): Promise<void> {
  const supabase = requireSupabaseClient();

  const { error } = await supabase
    .from("truck_types")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", truckTypeId)
    .eq("organization_id", organizationId)
    .is("deleted_at", null);

  if (error) throw new Error(`Unable to delete truck type: ${error.message}`);
}
