/**
 * Auth helpers for the admin console — same shape as mobile.
 * Uses email + password via Supabase Auth. Email confirmation is disabled
 * at the project level so signups (and signins) are immediate.
 */

import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export interface AuthResult {
  ok: boolean;
  user?: User;
  error?: string;
}

export async function getSession(): Promise<Session | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function getUser(): Promise<User | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user;
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, error: "Supabase not configured" };
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: error.message };
  return { ok: true, user: data.user ?? undefined };
}

export async function signUp(
  email: string,
  password: string,
  name?: string
): Promise<AuthResult> {
  if (!supabase) return { ok: false, error: "Supabase not configured" };
  // Signups via this app are managers (the admin console). The
  // handle_new_user() trigger reads role + name from raw_user_meta_data
  // and inserts the matching profiles row.
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { ...(name ? { name } : {}), role: "manager" },
    },
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, user: data.user ?? undefined };
}

export async function signOut(): Promise<void> {
  if (!supabase) return;
  // scope: 'global' invalidates the JWT server-side too, not just the local
  // session. Belt-and-braces.
  await supabase.auth.signOut({ scope: "global" });
}

export function onAuthChange(cb: (session: Session | null) => void): () => void {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_event, session) => cb(session));
  return () => data.subscription.unsubscribe();
}
