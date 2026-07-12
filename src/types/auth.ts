import type { Session, User } from "@supabase/supabase-js";
import type { Role } from "../constants/roles";

export type AuthProfile = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

export type AuthOrganization = {
  id: string;
  name: string;
  slug: string;
  status: string;
};

export type AuthOrganizationMembership = {
  id: string;
  organization_id: string;
  user_id: string;
  role: Role;
  status: string;
  joined_at: string | null;
  organization: AuthOrganization;
};

export type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: AuthProfile | null;
  organizations: AuthOrganization[];
  activeOrganization: AuthOrganization | null;
  activeMembership: AuthOrganizationMembership | null;
  role: Role | null;
  loading: boolean;
  configurationError: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  setActiveOrganization: (organizationId: string) => void;
  refreshAuthContext: (showLoading?: boolean) => Promise<void>;
};
