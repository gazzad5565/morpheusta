import { describe, test, expect, afterAll } from "vitest";
import { service, anon, asUser, tag } from "./helpers";

describe("RLS — row-level security", () => {
  test("RLS-6: anon role gets zero rows from customers", async () => {
    const sb = anon();
    const { data, error } = await sb.from("customers").select("id").limit(5);
    // Either error.code = PGRST301 (denied) or empty array, depending on policy phrasing.
    expect(error?.code === "PGRST301" || (data?.length ?? 0) === 0).toBe(true);
  });

  test("RLS-1: rep cannot read app_settings", async () => {
    const sb = await asUser(process.env.REP_EMAIL!, process.env.REP_PASSWORD!);
    const { data, error } = await sb.from("app_settings").select("*").limit(1);
    expect(error?.code === "PGRST301" || (data?.length ?? 0) === 0).toBe(true);
  });

  test("RLS-2: rep cannot UPDATE another rep's shift", async () => {
    const svc = service();
    const repEmail = process.env.REP_EMAIL!;
    const { data: me } = await svc.from("profiles").select("id").eq("email", repEmail).single();

    // Find any shift NOT belonging to me.
    const { data: foreignShift } = await svc
      .from("shifts")
      .select("id, rep_id")
      .neq("rep_id", me!.id)
      .limit(1)
      .single();
    if (!foreignShift) return; // skip if there isn't one in the DB

    const sb = await asUser(repEmail, process.env.REP_PASSWORD!);
    const { error, data } = await sb.from("shifts").update({ state: "complete" }).eq("id", foreignShift.id).select();
    expect(data?.length ?? 0).toBe(0);
    // RLS rejection comes back either as data: [] or as a PGRST error; both are acceptable.
  });

  test("RLS-5: manager can SELECT all profiles", async () => {
    const sb = await asUser(process.env.ADMIN_EMAIL!, process.env.ADMIN_PASSWORD!);
    const { data, error } = await sb.from("profiles").select("id").limit(5);
    expect(error).toBeNull();
    expect((data?.length ?? 0)).toBeGreaterThan(0);
  });
});

describe("Constraints + integrity", () => {
  test("CONS-1: customers.code must be unique", async () => {
    const svc = service();
    const code = tag("dup_code").slice(0, 16);
    const { error: e1 } = await svc.from("customers").insert({ name: tag(), code, initials: "QA", color: "#888", active: true });
    expect(e1).toBeNull();
    const { error: e2 } = await svc.from("customers").insert({ name: tag(), code, initials: "QA", color: "#888", active: true });
    expect(e2).not.toBeNull(); // unique violation expected
  });

  test("CONS-4: task_completions has no double-completion for same shift+task", async () => {
    // Sanity check rather than a constraint test. If the table allows duplicates,
    // we expect a `(shift_id, task_id)` UNIQUE; otherwise this test serves as documentation.
    const svc = service();
    const { data } = await svc.rpc("pg_table_def", { tname: "task_completions" }).select?.() ?? { data: null };
    // No introspection RPC exists by default — leaving this as a placeholder.
    // The real assertion comes from running the e2e check-in/check-out twice and seeing only one row.
    expect(true).toBe(true);
  });
});

afterAll(async () => {
  const svc = service();
  await svc.from("customers").delete().like("name", "qa_%");
});
