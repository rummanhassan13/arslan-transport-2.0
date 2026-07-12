-- ---------------------------------------------------------------------------
-- Migration 013: Security Advisor Fixes
-- ---------------------------------------------------------------------------

-- 1. Fix Mutable Search Path
-- Ensure the set_updated_at trigger function has a defined search path to prevent search path hijacking.
ALTER FUNCTION public.set_updated_at() SET search_path = public;

-- 2. Revoke Public Execution of Security Definer Functions
-- Prevent unauthenticated users (anon role) from executing these privileged helper functions.
REVOKE EXECUTE ON FUNCTION public.is_org_member(uuid) FROM public;
REVOKE EXECUTE ON FUNCTION public.has_org_role(uuid, text[]) FROM public;

-- Grant execute access back to authenticated and service roles so RLS policies continue to work correctly.
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_org_role(uuid, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.has_org_role(uuid, text[]) TO service_role;

-- 3. Fix Overly Permissive RLS Policy
-- The organizations_insert_authenticated policy was using WITH CHECK (true). 
-- We replace it with a check that ensures the user exists in the profiles table, preserving CRUD capabilities.
DROP POLICY IF EXISTS "organizations_insert_authenticated" ON public.organizations;
CREATE POLICY "organizations_insert_authenticated" ON public.organizations
  FOR INSERT TO authenticated
  WITH CHECK ( EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()) );
