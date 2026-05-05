"use client";

/**
 * /tasks/new — define a task for a customer.
 *
 * Mirrors /schedule/new style. The mobile app will pull the new row on
 * the next /active load for any shift at this customer.
 */

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AdminShell } from "@/components/shell/AdminShell";
import { Btn } from "@/components/ui/Btn";
import { Card, SectionTitle } from "@/components/ui/Card";
import { CustomerSwatch } from "@/components/ui/Avatars";
import { AGlyph } from "@/components/ui/AGlyph";
import { inputStyle } from "@/components/ui/Filters";
import { AC } from "@/lib/tokens";
import { listCustomers } from "@/lib/customers-store";
import { createTask } from "@/lib/tasks-store";
import type { Customer } from "@/lib/types";

export default function NewTaskPageWrapper() {
  return (
    <Suspense fallback={null}>
      <NewTaskPage />
    </Suspense>
  );
}

function NewTaskPage() {
  const router = useRouter();
  const params = useSearchParams();
  // Allow opening with ?customer=X to pre-fill (e.g. from a customer detail page).
  const fromCustomer = params.get("customer") || "";

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

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
    listCustomers().then((cs) => {
      if (cancelled) return;
      setCustomers(cs);
      const initial =
        fromCustomer && cs.some((c) => c.id === fromCustomer)
          ? fromCustomer
          : cs[0]?.id || "";
      setCustomerId(initial);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [fromCustomer]);

  const selected = customers.find((c) => c.id === customerId);

  const onSubmit = async () => {
    if (busy) return;
    setError(null);
    if (!customerId) return setError("Pick a customer.");
    if (!name.trim()) return setError("Give the task a name.");
    const dur = parseInt(duration, 10);
    if (Number.isNaN(dur) || dur < 0) return setError("Duration must be a number ≥ 0.");
    const ord = parseInt(order, 10);
    if (Number.isNaN(ord)) return setError("Order must be a number.");

    setBusy(true);
    const result = await createTask({
      customer_id: customerId,
      name: name.trim(),
      description: description.trim() || undefined,
      duration_min: dur,
      compulsory,
      sort_order: ord,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error || "Couldn't save the task.");
      return;
    }
    router.push("/tasks");
  };

  return (
    <AdminShell breadcrumbs={["Home", "Tasks", "New task"]}>
      <div
        style={{
          padding: 20,
          display: "grid",
          gridTemplateColumns: "1fr 360px",
          gap: 16,
          alignItems: "start",
        }}
      >
        <Card padding={20}>
          <SectionTitle>Define a task</SectionTitle>
          <div
            style={{
              fontFamily: AC.font,
              fontSize: 12.5,
              color: AC.mute,
              marginTop: 4,
              marginBottom: 16,
              lineHeight: 1.5,
            }}
          >
            Tasks belong to a customer. Reps see them on their phone during a shift at this
            customer. Mark <b style={{ color: AC.ink }}>Compulsory</b> for tasks that must be
            done before check-out.
          </div>

          <Field label="Customer" required>
            {loading ? (
              <div style={{ fontFamily: AC.font, fontSize: 13, color: AC.mute, padding: 12 }}>
                Loading customers…
              </div>
            ) : customers.length === 0 ? (
              <div
                style={{
                  padding: 12,
                  fontFamily: AC.font,
                  fontSize: 13,
                  color: AC.mute,
                  background: AC.bg,
                  borderRadius: 8,
                }}
              >
                No customers yet. Add one first via the{" "}
                <a href="/customers/new" style={{ color: AC.brandDeep, fontWeight: 600 }}>
                  Customers page
                </a>
                .
              </div>
            ) : (
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                style={inputStyle}
              >
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {c.code}
                  </option>
                ))}
              </select>
            )}
          </Field>

          <Field label="Task name" required>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Stock count — back office shelves"
              style={inputStyle}
            />
          </Field>

          <Field label="Description" hint="Optional. Shown when the rep taps the task.">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short notes for the rep"
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

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Btn onClick={() => router.push("/tasks")}>Cancel</Btn>
            <Btn
              kind="primary"
              icon="check"
              onClick={onSubmit}
              disabled={busy || customers.length === 0}
            >
              {busy ? "Saving…" : "Create task"}
            </Btn>
          </div>
        </Card>

        {/* Preview */}
        <Card padding={0}>
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${AC.line}` }}>
            <div
              style={{
                fontFamily: AC.font,
                fontSize: 11,
                fontWeight: 600,
                color: AC.mute,
                letterSpacing: 0.4,
                textTransform: "uppercase",
              }}
            >
              Preview
            </div>
          </div>
          {selected ? (
            <div style={{ padding: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <CustomerSwatch customer={selected} size={36} />
                <div>
                  <div
                    style={{
                      fontFamily: AC.font,
                      fontSize: 13,
                      fontWeight: 700,
                      color: AC.ink,
                    }}
                  >
                    {selected.name}
                  </div>
                  <div style={{ fontFamily: AC.font, fontSize: 11.5, color: AC.mute }}>
                    Code {selected.code}
                  </div>
                </div>
              </div>
              <div
                style={{
                  border: `1px solid ${AC.line}`,
                  borderRadius: 10,
                  padding: 12,
                  background: AC.bg,
                }}
              >
                <div
                  style={{
                    fontFamily: AC.font,
                    fontSize: 13,
                    fontWeight: 600,
                    color: AC.ink,
                  }}
                >
                  {name || "Task name"}
                </div>
                {description && (
                  <div
                    style={{
                      fontFamily: AC.font,
                      fontSize: 12,
                      color: AC.mute,
                      marginTop: 4,
                    }}
                  >
                    {description}
                  </div>
                )}
                <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                  <span
                    style={{
                      padding: "2px 8px",
                      borderRadius: 99,
                      fontFamily: AC.font,
                      fontSize: 10.5,
                      fontWeight: 700,
                      letterSpacing: 0.3,
                      textTransform: "uppercase",
                      background: compulsory ? AC.dangerTint : AC.brandSoft,
                      color: compulsory ? AC.danger : AC.brandDeep,
                    }}
                  >
                    {compulsory ? "Compulsory" : "Optional"}
                  </span>
                  <span
                    style={{
                      padding: "2px 8px",
                      borderRadius: 99,
                      fontFamily: AC.fontMono,
                      fontSize: 10.5,
                      fontWeight: 700,
                      background: AC.bg,
                      border: `1px solid ${AC.line}`,
                      color: AC.ink2,
                    }}
                  >
                    ~{duration || 0}m
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div
              style={{
                padding: 20,
                fontFamily: AC.font,
                fontSize: 13,
                color: AC.mute,
                textAlign: "center",
              }}
            >
              Pick a customer to preview
            </div>
          )}
        </Card>
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
