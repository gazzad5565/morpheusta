/**
 * Shared Supabase client for the Morpheus mobile app.
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY from env.
 * Both are designed to be public — security comes from the Row Level Security
 * policies defined in the Supabase project itself, not from key secrecy.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  // Throw early in dev so we don't silently no-op. In production this would
  // typically render a helpful "service not configured" UI; for Phase 1 we
  // just want a clear error.
  // eslint-disable-next-line no-console
  console.warn(
    "[supabase] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
      "Database features will be disabled."
  );
}

export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        auth: {
          // Phase 2: persist session in browser localStorage so users stay
          // logged in across reloads / app re-opens. Auto-refresh tokens.
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null;

export const isSupabaseConfigured = (): boolean => supabase !== null;
