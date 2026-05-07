import { createClient, SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL!;
const ANON = process.env.SUPABASE_ANON_KEY!;
const SVC = process.env.SUPABASE_SERVICE_KEY!;

if (!URL || !ANON || !SVC) {
  throw new Error("SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_KEY missing — copy .env.example to .env and fill in.");
}

/** Privileged client. Bypasses RLS. Use ONLY for setup/teardown. */
export function serviceClient(): SupabaseClient {
  return createClient(URL, SVC, { auth: { persistSession: false } });
}

/** Anon (logged-out) client — for testing public surface. */
export function anonClient(): SupabaseClient {
  return createClient(URL, ANON, { auth: { persistSession: false } });
}

/** Anon client signed in as a real user — RLS applies. */
export async function userClient(email: string, password: string): Promise<SupabaseClient> {
  const sb = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`userClient signIn failed: ${error.message}`);
  return sb;
}

/** Tag every row created by tests so teardown can find it. */
export const QA_PREFIX = "qa_";

export function qaTag(suffix = ""): string {
  return `${QA_PREFIX}${Date.now()}${suffix ? "_" + suffix : ""}`;
}

/** Wipe every row whose name starts with the QA prefix. */
export async function purgeQARows(): Promise<void> {
  const sb = serviceClient();
  await sb.from("shifts").delete().like("series_id", `${QA_PREFIX}%`);
  await sb.from("customer_tasks").delete().like("name", `${QA_PREFIX}%`);
  await sb.from("customers").delete().like("name", `${QA_PREFIX}%`);
}
