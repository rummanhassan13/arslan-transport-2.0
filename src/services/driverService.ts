import { requireSupabaseClient } from "../lib/supabase";
import type { Driver, DriverInput, DriverUpdateInput } from "../types/domain";

type DriverRow = {
  id: string;
  organization_id: string;
  name: string;
  phone: string | null;
  cnic: string | null;
  license_number: string | null;
  provider_name: string | null;
  notes: string | null;
  status: "active" | "inactive" | "blocked";
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

const driverSelect = "id, organization_id, name, phone, cnic, license_number, provider_name, notes, status, created_at, updated_at, deleted_at";

function toDriver(row: DriverRow): Driver {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    phone: row.phone,
    cnic: row.cnic,
    licenseNumber: row.license_number,
    providerName: row.provider_name,
    notes: row.notes,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function toDriverPayload(input: DriverInput | DriverUpdateInput) {
  return {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.phone !== undefined ? { phone: input.phone } : {}),
    ...(input.cnic !== undefined ? { cnic: input.cnic } : {}),
    ...(input.licenseNumber !== undefined ? { license_number: input.licenseNumber } : {}),
    ...(input.providerName !== undefined ? { provider_name: input.providerName } : {}),
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

export async function listDrivers(organizationId: string): Promise<Driver[]> {
  const supabase = requireSupabaseClient();

  const { data, error } = await supabase
    .from("drivers")
    .select(driverSelect)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .order("name", { ascending: true });

  if (error) throw new Error(`Unable to load drivers: ${error.message}`);
  return ((data ?? []) as DriverRow[]).map(toDriver);
}

export async function createDriver(organizationId: string, input: DriverInput): Promise<Driver> {
  const supabase = requireSupabaseClient();
  const userId = await getCurrentUserId();

  const { data, error } = await supabase
    .from("drivers")
    .insert({
      ...toDriverPayload({ ...input, status: input.status ?? "active" }),
      organization_id: organizationId,
      created_by: userId,
      updated_by: userId,
    })
    .select(driverSelect)
    .single();

  if (error) throw new Error(`Unable to create driver: ${error.message}`);
  return toDriver(data as DriverRow);
}

export async function updateDriver(organizationId: string, driverId: string, input: DriverUpdateInput): Promise<Driver> {
  const supabase = requireSupabaseClient();
  const userId = await getCurrentUserId();

  const { data, error } = await supabase
    .from("drivers")
    .update({
      ...toDriverPayload(input),
      updated_by: userId,
    })
    .eq("id", driverId)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .select(driverSelect)
    .single();

  if (error) throw new Error(`Unable to update driver: ${error.message}`);
  return toDriver(data as DriverRow);
}

export async function softDeleteDriver(organizationId: string, driverId: string): Promise<void> {
  const supabase = requireSupabaseClient();
  const userId = await getCurrentUserId();

  const { error } = await supabase
    .from("drivers")
    .update({
      deleted_at: new Date().toISOString(),
      updated_by: userId,
    })
    .eq("id", driverId)
    .eq("organization_id", organizationId)
    .is("deleted_at", null);

  if (error) throw new Error(`Unable to delete driver: ${error.message}`);
}
