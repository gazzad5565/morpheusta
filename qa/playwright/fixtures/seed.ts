import { serviceClient, qaTag } from "../helpers/supabase";

export async function createCustomer(opts?: { name?: string; geofenceM?: number; lat?: number; lng?: number }) {
  const sb = serviceClient();
  const name = opts?.name ?? qaTag("customer");
  const { data, error } = await sb
    .from("customers")
    .insert({
      name,
      code: name.slice(0, 16),
      initials: "QA",
      color: "#888",
      active: true,
      latitude: opts?.lat ?? 51.5074,
      longitude: opts?.lng ?? -0.1278,
      geofence_radius_m: opts?.geofenceM ?? 100,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function createShift(opts: {
  customer_id: string;
  rep_id: string | null;
  shift_date: string; // YYYY-MM-DD
  start_time: string; // HH:MM
  end_time: string; // HH:MM
}) {
  const sb = serviceClient();
  const { data, error } = await sb
    .from("shifts")
    .insert({ ...opts, state: "scheduled" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function createTask(customer_id: string, opts?: { name?: string; compulsory?: boolean }) {
  const sb = serviceClient();
  const { data, error } = await sb
    .from("customer_tasks")
    .insert({
      customer_id,
      name: opts?.name ?? qaTag("task"),
      compulsory: opts?.compulsory ?? true,
      duration_min: 5,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}
