const rawDemoMode = import.meta.env.VITE_DEMO_MODE;
const supabaseUrl =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ||
  (import.meta.env.NEXT_PUBLIC_SUPABASE_URL as string | undefined);
const supabasePublishableKey =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ||
  (import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as string | undefined);
const supabaseAnonKey =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ||
  (import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string | undefined);
const supabaseKey = supabasePublishableKey || supabaseAnonKey;
const productionMode = import.meta.env.PROD;
const demoMode = rawDemoMode === undefined ? !productionMode : rawDemoMode === "true";

export const env = {
  demoMode,
  supabaseUrl,
  supabasePublishableKey,
  supabaseAnonKey,
  supabaseKey,
  supabaseConfigured: Boolean(supabaseUrl && supabaseKey),
};

export function getMissingSupabaseEnvVars() {
  if (env.demoMode) return [];

  return [
    !env.supabaseUrl ? "VITE_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL" : null,
    !env.supabaseKey ? "VITE_SUPABASE_PUBLISHABLE_KEY, VITE_SUPABASE_ANON_KEY, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, or NEXT_PUBLIC_SUPABASE_ANON_KEY" : null,
  ].filter(Boolean) as string[];
}
