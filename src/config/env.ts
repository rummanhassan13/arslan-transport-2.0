const rawDemoMode = import.meta.env.VITE_DEMO_MODE;
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
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
  const missing = productionMode && rawDemoMode !== "false" ? ["VITE_DEMO_MODE=false"] : [];

  if (env.demoMode) return missing;

  return [
    ...missing,
    !env.supabaseUrl ? "VITE_SUPABASE_URL" : null,
    !env.supabaseKey ? "VITE_SUPABASE_PUBLISHABLE_KEY or VITE_SUPABASE_ANON_KEY" : null,
  ].filter(Boolean) as string[];
}
