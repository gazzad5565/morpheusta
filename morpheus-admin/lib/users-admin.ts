/**
 * Client-side helpers for /api/users.
 *
 * Each call attaches the current Supabase session's access token in
 * Authorization: Bearer …, so the server route can verify the caller
 * is a manager before doing anything sensitive.
 */

import { supabase } from "./supabase";

async function authHeaders(): Promise<Record<string, string>> {
  if (!supabase) return { "Content-Type": "application/json" };
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export interface CreateUserInput {
  email: string;
  password: string;
  name: string;
  role: "manager" | "rep";
}

export async function createUser(
  input: CreateUserInput
): Promise<{ ok: boolean; error?: string; id?: string }> {
  try {
    const r = await fetch("/api/users", {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify(input),
    });
    const json = (await r.json()) as { ok: boolean; error?: string; id?: string };
    if (!r.ok || !json.ok) {
      return { ok: false, error: json.error || `HTTP ${r.status}` };
    }
    return { ok: true, id: json.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export interface UpdateUserInput {
  id: string;
  email?: string;
  password?: string;
  name?: string;
  role?: "manager" | "rep";
}

export async function updateUser(
  input: UpdateUserInput
): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch("/api/users", {
      method: "PATCH",
      headers: await authHeaders(),
      body: JSON.stringify(input),
    });
    const json = (await r.json()) as { ok: boolean; error?: string };
    if (!r.ok || !json.ok) {
      return { ok: false, error: json.error || `HTTP ${r.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function deleteUser(
  id: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch("/api/users", {
      method: "DELETE",
      headers: await authHeaders(),
      body: JSON.stringify({ id }),
    });
    const json = (await r.json()) as { ok: boolean; error?: string };
    if (!r.ok || !json.ok) {
      return { ok: false, error: json.error || `HTTP ${r.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Generate a random password the admin can share with a new user.
 *  12 chars, mixed alphanumeric + a couple of symbols. */
export function randomPassword(length = 12): string {
  const charset =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@$%&*";
  let out = "";
  if (typeof window !== "undefined" && window.crypto?.getRandomValues) {
    const buf = new Uint32Array(length);
    window.crypto.getRandomValues(buf);
    for (let i = 0; i < length; i++) {
      out += charset[buf[i] % charset.length];
    }
  } else {
    for (let i = 0; i < length; i++) {
      out += charset[Math.floor(Math.random() * charset.length)];
    }
  }
  return out;
}
