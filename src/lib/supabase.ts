import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "../config/env";

export const supabase: SupabaseClient | null =
  env.supabaseConfigured && env.supabaseUrl && env.supabaseKey
    ? createClient(env.supabaseUrl, env.supabaseKey)
    : null;

export function requireSupabaseClient() {
  if (!supabase) {
    throw new Error("Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY or VITE_SUPABASE_ANON_KEY when VITE_DEMO_MODE=false.");
  }

  return supabase;
}
