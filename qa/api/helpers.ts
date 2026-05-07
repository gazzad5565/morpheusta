import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config();

export const URL = process.env.SUPABASE_URL!;
export const ANON = process.env.SUPABASE_ANON_KEY!;
export const SVC = process.env.SUPABASE_SERVICE_KEY!;

export const service = () => createClient(URL, SVC, { auth: { persistSession: false } });
export const anon = () => createClient(URL, ANON, { auth: { persistSession: false } });

export async function asUser(email: string, password: string) {
  const sb = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return sb;
}

export const QA = "qa_";
export const tag = (s = "") => `${QA}${Date.now()}${s ? "_" + s : ""}`;
