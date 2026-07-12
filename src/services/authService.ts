import type { Session, User } from "@supabase/supabase-js";
import { requireSupabaseClient, supabase } from "../lib/supabase";
import type { AuthOrganization, AuthOrganizationMembership, AuthProfile } from "../types/auth";

type MembershipRow = {
  id: string;
  organization_id: string;
  user_id: string;
  role: AuthOrganizationMembership["role"];
  status: string;
  joined_at: string | null;
  organizations: AuthOrganization | AuthOrganization[] | null;
};

function normalizeMembership(row: MembershipRow): AuthOrganizationMembership | null {
  const organization = Array.isArray(row.organizations) ? row.organizations[0] : row.organizations;
  if (!organization) return null;

  return {
    id: row.id,
    organization_id: row.organization_id,
    user_id: row.user_id,
    role: row.role,
    status: row.status,
    joined_at: row.joined_at,
    organization,
  };
}

export async function getCurrentSession(): Promise<Session | null> {
  if (!supabase) return null;

  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function getCurrentUser(): Promise<User | null> {
  if (!supabase) return null;

  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user;
}

export async function signInWithEmailPassword(email: string, password: string): Promise<Session | null> {
  const client = requireSupabaseClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}

export async function signOut(): Promise<void> {
  if (!supabase) return;

  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getCurrentProfile(): Promise<AuthProfile | null> {
  const user = await getCurrentUser();
  if (!user || !supabase) return null;

  const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (error) throw error;
  return data as AuthProfile | null;
}

export async function getUserOrganizations(): Promise<AuthOrganizationMembership[]> {
  const user = await getCurrentUser();
  if (!user || !supabase) return [];

  const { data, error } = await supabase
    .from("organization_members")
    .select("id, organization_id, user_id, role, status, joined_at, organizations(id, name, slug, status)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("joined_at", { ascending: true });

  if (error) throw error;

  return ((data ?? []) as MembershipRow[]).map(normalizeMembership).filter(Boolean) as AuthOrganizationMembership[];
}

export async function getActiveOrganizationMembership(): Promise<AuthOrganizationMembership | null> {
  const memberships = await getUserOrganizations();
  return memberships[0] ?? null;
}
