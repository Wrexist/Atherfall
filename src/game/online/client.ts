import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Lovable Cloud (Supabase underneath) writes these into .env when Cloud is
// enabled. Without them the game simply runs offline — nothing online is shown.
const env = (import.meta.env ?? {}) as Record<string, string | undefined>;
const url = env["VITE_SUPABASE_URL"];
const key = env["VITE_SUPABASE_PUBLISHABLE_KEY"] ?? env["VITE_SUPABASE_ANON_KEY"];

export const onlineConfigured = !!url && !!key;

let client: SupabaseClient | null = null;

/**
 * The shared backend client, or null when the game is offline-only (or during
 * SSR). Uses Supabase's default session storage, so a session created by other
 * Lovable-generated code (e.g. a "Sign in with Google" button) is shared.
 */
export function backend(): SupabaseClient | null {
  if (!onlineConfigured || typeof window === "undefined") return null;
  client ??= createClient(url!, key!, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    realtime: { params: { eventsPerSecond: 20 } },
  });
  return client;
}
