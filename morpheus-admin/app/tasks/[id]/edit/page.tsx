"use client";

/**
 * /tasks/[id]/edit — edit a single task row.
 *
 * Editing the customer scope is allowed (specific customer ↔ universal),
 * but only one customer at a time — multi-customer is a "create N rows"
 * affordance, not an edit affordance.
 */

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminShell } from "@/components/shell/AdminShell";
import { Btn } from "@/components/ui/Btn";
import { Card, SectionTitle } from "@/components/ui/Card";
import { AGlyph } from "@/components/ui/AGlyph";
import { inputStyle } from "@/components/ui/Filters";
import { Combobox } from "@/components/ui/Combobox";
import { AC } from "@/lib/tokens";
import { listCustomers } from "@/lib/customers-store";
import { getTask, updateTask, deleteTask } from "@/lib/tasks-store";
import { CustomFieldsCard } from "@/components/ui/CustomFieldsCard";
import type { Customer } from "@/lib/types";

export default function EditTaskPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const { id } = use(params);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // "" = universal, otherwise a customer id
  const [customerId, setCustomerId] = useState<string>("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState("10");
  const [compulsory, setCompulsory] = useState(false);
  const [order, setOrder] = useState("0");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listCustomers(), getTask(id)]).then(([cs, t]) => {
      if (cancelled) return;
      setCustomers(cs);
      if (!t) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setCustomerId(t.customer_id ?? "");
      setName(t.name);
      setDescription(t.description ?? "");
      setDuration(String(t.duration_min));
      setCompulsory(t.compulsory);
      setOrder(String(t.sort_order));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const onSave = async () => {
    if (busy) return;
    setError(null);
    if (!name.trim()) return setError("Give the task a name.");
    const dur = parseInt(duration, 10);
    if (Number.isNaN(dur) || dur < 0) return setError("Duration must be a number ≥ 0.");
    const ord = parseInt(order, 10);
    if (Number.isNaN(ord)) return setError("Order must be a number.");

    setBusy(true);
    const r = await updateTask(id, {
      customer_id: customerId === "" ? null : customerId,
      name: name.trim(),
      description: description.trim() || null,
      duration_min: dur,
      compulsory,
      sort_order: ord,
    });
    setBusy(false);
    if (!r.ok) {
      setError(r.error || "Couldn't save.");
      return;
    }
    router.push("/tasks");
  };

  const onDelete = async () => {
    if (!confirm(`Delete "${name}"? This can't be undone.`)) return;
    setBusy(true);
    const r = await deleteTask(id);
    setBusy(false);
    if (!r.ok) {
      alert(`Couldn't delete: ${r.error}`);
      return;
    }
    router.push("/tasks");
  };

  if (loading) {
    return (
      <AdminShell breadcrumbs={["Home", "Tasks", "…"]}>
        <div style={{ padding: 32, fontFamily: AC.font, fontSize: 13, color: AC.mute }}>
          Loading task…
        </div>
      </AdminShell>
    );
  }

  if (notFound) {
    return (
      <AdminShell breadcrumbs={["Home", "Tasks", "Not found"]}>
        <div style={{ padding: 32 }}>
          <Card padding={24}>
            <div style={{ fontFamily: AC.font, fontSize: 14, color: AC.ink, marginBottom: 8 }}>
              No task found with this ID.
            </div>
            <Btn onClick={() => router.push("/tasks")}>Back to Tasks</Btn>
          </Card>
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell breadcrumbs={["Home", "Tasks", { label: name || "Edit task" }]}>
      <div
        style={{
          padding: 20,
          display: "grid",
          gridTemplateColumns: "1fr 320px",
          gap: 16,
          alignItems: "start",
        }}
      >
        <Card padding={20}>
          <SectionTitle>Edit task</SectionTitle>

          <Field label="Applies to" required>
            <Combobox
              value={customerId || ""}
              onChange={(v) => setCustomerId(v ?? "")}
              triggerIcon="customer"
              placeholder="All customers (universal)"
              options={[
                { value: "", label: "All customers", sublabel: "Universal task" },
                ...customers.map((c) => ({
                  value: c.id,
                  label: c.name,
                  sublabel: c.code,
                  color: c.color || undefined,
                })),
              ]}
            />
          </Field>

          <Field label="Task name" required>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={inputStyle}
            />
          </Field>

          <Field label="Description" hint="Optional. Shown when the rep taps the task.">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              style={{
                ...inputStyle,
                resize: "vertical",
                fontFamily: AC.font,
              }}
            />
          </Field>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
            <Field label="Duration (min)" required>
              <input
                value={duration}
                onChange={(e) => setDuration(e.target.value.replace(/\D/g, ""))}
                style={{ ...inputStyle, fontFamily: AC.fontMono }}
              />
            </Field>
            <Field label="Order" hint="Lower = shows first.">
              <input
                value={order}
                onChange={(e) => setOrder(e.target.value.replace(/[^0-9-]/g, ""))}
                style={{ ...inputStyle, fontFamily: AC.fontMono }}
              />
            </Field>
            <Field label="Compulsory">
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "9px 11px",
                  border: `1px solid ${AC.line}`,
                  borderRadius: 10,
                  background: "#fff",
                  cursor: "pointer",
                  fontFamily: AC.font,
                  fontSize: 13,
                  color: AC.ink,
                }}
              >
                <input
                  type="checkbox"
                  checked={compulsory}
                  onChange={(e) => setCompulsory(e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: AC.brand }}
                />
                Required
              </label>
            </Field>
          </div>

          {error && (
            <div
              style={{
                padding: "10px 12px",
                background: AC.dangerTint,
                color: "#9c1a3c",
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 500,
                display: "flex",
                gap: 8,
                alignItems: "flex-start",
                marginBottom: 12,
              }}
            >
              <AGlyph name="warn" size={14} color="#9c1a3c" />
              <span>{error}</span>
            </div>
          )}

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Btn kind="danger" onClick={onDelete} disabled={busy}>
              Delete
            </Btn>
            <div style={{ display: "flex", gap: 8 }}>
              <Btn onClick={() => router.push("/tasks")}>Cancel</Btn>
              <Btn kind="primary" icon="check" onClick={onSave} disabled={busy}>
                {busy ? "Saving…" : "Save changes"}
              </Btn>
            </div>
          </div>
        </Card>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Card padding={16}>
            <div
              style={{
                fontFamily: AC.font,
                fontSize: 11,
                fontWeight: 600,
                color: AC.mute,
                letterSpacing: 0.4,
                textTransform: "uppercase",
                marginBottom: 8,
              }}
            >
              About editing
            </div>
            <div
              style={{
                fontFamily: AC.font,
                fontSize: 12.5,
                color: AC.ink2,
                lineHeight: 1.55,
              }}
            >
              Edits affect this single row. To re-spray a task across many customers, delete this
              row and create a fresh one with the multi-customer scope.
            </div>
          </Card>
          <CustomFieldsCard entity="task" entityId={id} />
        </div>
      </div>
    </AdminShell>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          fontFamily: AC.font,
          fontSize: 11,
          color: AC.mute,
          fontWeight: 700,
          letterSpacing: 0.3,
          textTransform: "uppercase",
          marginBottom: 6,
        }}
      >
        {label}
        {required && <span style={{ color: AC.danger, marginLeft: 4 }}>*</span>}
      </div>
      {children}
      {hint && (
        <div style={{ fontFamily: AC.font, fontSize: 11, color: AC.mute, marginTop: 4 }}>
          {hint}
        </div>
      )}
    </div>
  );
}
