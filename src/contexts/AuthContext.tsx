import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { env, getMissingSupabaseEnvVars } from "../config/env";
import { supabase } from "../lib/supabase";
import {
  getCurrentProfile,
  getCurrentSession,
  getCurrentUser,
  getUserOrganizations,
  signInWithEmailPassword,
  signOut as authSignOut,
} from "../services/authService";
import type { AuthContextValue, AuthOrganization, AuthOrganizationMembership, AuthProfile } from "../types/auth";

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const activeOrganizationStorageKey = "transportflow.activeOrganizationId";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [organizations, setOrganizations] = useState<AuthOrganization[]>([]);
  const [memberships, setMemberships] = useState<AuthOrganizationMembership[]>([]);
  const [activeMembership, setActiveMembership] = useState<AuthOrganizationMembership | null>(null);
  const [loading, setLoading] = useState(true);

  const missingEnv = getMissingSupabaseEnvVars();
  const configurationError = missingEnv.length ? `Missing Supabase environment variables: ${missingEnv.join(", ")}` : null;

  const refreshAuthContext = useCallback(async (showLoading = true) => {
    if (env.demoMode || !supabase || configurationError) {
      setSession(null);
      setUser(null);
      setProfile(null);
      setOrganizations([]);
      setMemberships([]);
      setActiveMembership(null);
      if (showLoading) setLoading(false);
      return;
    }

    if (showLoading) setLoading(true);
    try {
      const [nextSession, nextUser] = await Promise.all([getCurrentSession(), getCurrentUser()]);
      setSession(nextSession);
      setUser(nextUser);

      if (!nextUser) {
        setProfile(null);
        setOrganizations([]);
        setMemberships([]);
        setActiveMembership(null);
        return;
      }

      const [nextProfile, memberships] = await Promise.all([getCurrentProfile(), getUserOrganizations()]);
      setProfile(nextProfile);
      setOrganizations(memberships.map((membership) => membership.organization));
      setMemberships(memberships);
      const storedOrganizationId = window.localStorage.getItem(activeOrganizationStorageKey);
      setActiveMembership(memberships.find((membership) => membership.organization_id === storedOrganizationId) ?? memberships[0] ?? null);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [configurationError]);

  useEffect(() => {
    void refreshAuthContext();

    if (env.demoMode || !supabase || configurationError) return undefined;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      
      if (event === "SIGNED_OUT") {
        setProfile(null);
        setOrganizations([]);
        setMemberships([]);
        setActiveMembership(null);
        return;
      }

      if (event === "SIGNED_IN" || event === "USER_UPDATED") {
        void refreshAuthContext(false);
        return;
      }
      
      // INITIAL_SESSION and TOKEN_REFRESHED do not require a refresh
    });

    return () => subscription.unsubscribe();
  }, [configurationError, refreshAuthContext]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      await signInWithEmailPassword(email, password);
      await refreshAuthContext();
    },
    [refreshAuthContext],
  );

  const signOut = useCallback(async () => {
    await authSignOut();
    setSession(null);
    setUser(null);
    setProfile(null);
    setOrganizations([]);
    setMemberships([]);
    setActiveMembership(null);
  }, []);

  const setActiveOrganization = useCallback((organizationId: string) => {
    const membership = memberships.find((item) => item.organization_id === organizationId);
    if (!membership) throw new Error("You do not have active access to that organization.");
    window.localStorage.setItem(activeOrganizationStorageKey, organizationId);
    setActiveMembership(membership);
  }, [memberships]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user,
      profile,
      organizations,
      activeOrganization: activeMembership?.organization ?? null,
      activeMembership,
      role: activeMembership?.role ?? null,
      loading,
      configurationError,
      signIn,
      signOut,
      setActiveOrganization,
      refreshAuthContext,
    }),
    [activeMembership, configurationError, loading, organizations, profile, refreshAuthContext, session, setActiveOrganization, signIn, signOut, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuthContext must be used inside AuthProvider");
  }

  return context;
}
