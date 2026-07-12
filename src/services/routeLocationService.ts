import { requireSupabaseClient } from "../lib/supabase";

export type RouteLocationType = "loading_point" | "destination";

export type RouteLocation = {
  id: string;
  organizationId: string;
  type: RouteLocationType;
  name: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

type RouteLocationRow = {
  id: string;
  organization_id: string;
  type: RouteLocationType;
  name: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

const routeLocationSelect = "id, organization_id, type, name, created_at, updated_at, deleted_at";

function toRouteLocation(row: RouteLocationRow): RouteLocation {
  return {
    id: row.id,
    organizationId: row.organization_id,
    type: row.type,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

async function getCurrentUserId() {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw new Error(`Unable to read current user: ${error.message}`);
  return data.user?.id ?? null;
}

export async function listRouteLocations(organizationId: string, type?: RouteLocationType): Promise<RouteLocation[]> {
  const supabase = requireSupabaseClient();
  let query = supabase
    .from("route_locations")
    .select(routeLocationSelect)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .order("name", { ascending: true });

  if (type) query = query.eq("type", type);

  const { data, error } = await query;
  if (error) throw new Error(`Unable to load saved route locations: ${error.message}`);
  return ((data ?? []) as RouteLocationRow[]).map(toRouteLocation);
}

export async function createRouteLocation(organizationId: string, type: RouteLocationType, name: string): Promise<RouteLocation> {
  const supabase = requireSupabaseClient();
  const cleanedName = name.trim().replace(/\s+/g, " ");
  if (!cleanedName) throw new Error("Route location name is required.");

  const { data: existing, error: existingError } = await supabase
    .from("route_locations")
    .select(routeLocationSelect)
    .eq("organization_id", organizationId)
    .eq("type", type)
    .ilike("name", cleanedName)
    .is("deleted_at", null)
    .maybeSingle();
  if (existingError) throw new Error(`Unable to check route location: ${existingError.message}`);
  if (existing) return toRouteLocation(existing as RouteLocationRow);

  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("route_locations")
    .insert({
      organization_id: organizationId,
      type,
      name: cleanedName,
      created_by: userId,
    })
    .select(routeLocationSelect)
    .single();

  if (error) throw new Error(`Unable to save route location: ${error.message}`);
  return toRouteLocation(data as RouteLocationRow);
}
