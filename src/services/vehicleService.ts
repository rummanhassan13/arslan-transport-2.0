import { requireSupabaseClient } from "../lib/supabase";
import type { Vehicle, VehicleInput, VehicleUpdateInput } from "../types/domain";

type VehicleRelation = { name: string | null } | { name: string | null }[] | null;

type VehicleRow = {
  id: string;
  organization_id: string;
  vehicle_number: string;
  truck_type_id: string | null;
  driver_id: string | null;
  notes: string | null;
  status: "active" | "inactive" | "maintenance" | "blocked";
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  truck_types?: VehicleRelation;
  drivers?: VehicleRelation;
};

const vehicleSelect =
  "id, organization_id, vehicle_number, truck_type_id, driver_id, notes, status, created_at, updated_at, deleted_at, truck_types(name), drivers(name)";

function relationName(relation: VehicleRelation | undefined) {
  if (!relation) return null;
  return Array.isArray(relation) ? relation[0]?.name ?? null : relation.name;
}

function toVehicle(row: VehicleRow): Vehicle {
  return {
    id: row.id,
    organizationId: row.organization_id,
    vehicleNumber: row.vehicle_number,
    truckTypeId: row.truck_type_id,
    truckTypeName: relationName(row.truck_types),
    driverId: row.driver_id,
    driverName: relationName(row.drivers),
    notes: row.notes,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function toVehiclePayload(input: VehicleInput | VehicleUpdateInput) {
  return {
    ...(input.vehicleNumber !== undefined ? { vehicle_number: input.vehicleNumber } : {}),
    ...(input.truckTypeId !== undefined ? { truck_type_id: input.truckTypeId } : {}),
    ...(input.driverId !== undefined ? { driver_id: input.driverId } : {}),
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

export async function listVehicles(organizationId: string): Promise<Vehicle[]> {
  const supabase = requireSupabaseClient();

  const { data, error } = await supabase
    .from("vehicles")
    .select(vehicleSelect)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .order("vehicle_number", { ascending: true });

  if (error) throw new Error(`Unable to load vehicles: ${error.message}`);
  return ((data ?? []) as VehicleRow[]).map(toVehicle);
}

export async function createVehicle(organizationId: string, input: VehicleInput): Promise<Vehicle> {
  const supabase = requireSupabaseClient();
  const userId = await getCurrentUserId();

  const { data, error } = await supabase
    .from("vehicles")
    .insert({
      ...toVehiclePayload({ ...input, status: input.status ?? "active" }),
      organization_id: organizationId,
      created_by: userId,
      updated_by: userId,
    })
    .select(vehicleSelect)
    .single();

  if (error) throw new Error(`Unable to create vehicle: ${error.message}`);
  return toVehicle(data as VehicleRow);
}

export async function updateVehicle(organizationId: string, vehicleId: string, input: VehicleUpdateInput): Promise<Vehicle> {
  const supabase = requireSupabaseClient();
  const userId = await getCurrentUserId();

  const { data, error } = await supabase
    .from("vehicles")
    .update({
      ...toVehiclePayload(input),
      updated_by: userId,
    })
    .eq("id", vehicleId)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .select(vehicleSelect)
    .single();

  if (error) throw new Error(`Unable to update vehicle: ${error.message}`);
  return toVehicle(data as VehicleRow);
}

export async function softDeleteVehicle(organizationId: string, vehicleId: string): Promise<void> {
  const supabase = requireSupabaseClient();
  const userId = await getCurrentUserId();

  const { error } = await supabase
    .from("vehicles")
    .update({
      deleted_at: new Date().toISOString(),
      updated_by: userId,
    })
    .eq("id", vehicleId)
    .eq("organization_id", organizationId)
    .is("deleted_at", null);

  if (error) throw new Error(`Unable to delete vehicle: ${error.message}`);
}
