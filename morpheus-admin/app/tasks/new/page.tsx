"use client";

/**
 * /tasks/new — define a task that applies to one customer, several
 * customers, or ALL customers.
 *
 * - "All customers" inserts one row with customer_id = NULL (universal).
 * - "Specific customers" lets the manager tick a checkbox list; on save
 *   one row is inserted per selected customer.
 *
 * The mobile /active screen reads tasks for the rep's current shift's
 * customer AND any universal (NULL) rows, so a single universal task
 * shows up at every customer.
 */

import { Suspense, useEffect, useMemo, useState } from "react";
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

type Scope = "all" | "specific";

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
  const fromCustomer = params.get("customer") || "";

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  const [scope, setScope] = useState<Scope>("specific");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState("10");
  const [compulsory, setCompulsory] = useState(false);
  const [order, setOrder] = useState("0");
  // Feature C — photos per task. photoCount=0 hides the requirement
  // entirely; otherwise the rep must capture N photos.
  //
  // Why no separate "photos compulsory" state: the two flags drift
  // apart in confusing ways ("task is required but photos aren't, so
  // a rep can complete the compulsory task with no photos?"). Per
  // product (May 13), the rule is: photos_compulsory ALWAYS mirrors
  // task.compulsory. Single source of truth = the existing `compulsory`
  // toggle, with the label flagging that it also gates photos when
  // photoCount > 0.
  const [photoCount, setPhotoCount] = useState("0");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listCustomers().then((cs) => {
      if (cancelled) return;
      setCustomers(cs);
      // Pre-select if opened from a customer detail page.
      if (fromCustomer && cs.some((c) => c.id === fromCustomer)) {
        setScope("specific");
        setSelectedIds(new Set([fromCustomer]));
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [fromCustomer]);

  const toggleCustomer = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedIds(new Set(customers.map((c) => c.id)));
  const clearAll = () => setSelectedIds(new Set());

  const previewLabel = useMemo(() => {
    if (scope === "all") return "All customers";
    const n = selectedIds.size;
    if (n === 0) return "No customers picked";
    if (n === 1) {
      const c = customers.find((c) => selectedIds.has(c.id));
      return c?.name || "1 customer";
    }
    return `${n} customers`;
  }, [scope, selectedIds, customers]);

  const onSubmit = async () => {
    if (busy) return;
    setError(null);
    if (!name.trim()) return setError("Give the task a name.");
    const dur = parseInt(duration, 10);
    if (Number.isNaN(dur) || dur < 0) return setError("Duration must be a number ≥ 0.");
    const ord = parseInt(order, 10);
    if (Number.isNaN(ord)) return setError("Order must be a number.");

    let customerIds: string[] | null;
    if (scope === "all") {
      customerIds = null;
    } else {
      customerIds = Array.from(selectedIds);
      if (customerIds.length === 0) {
        return setError("Pick at least one customer, or switch to 'All customers'.");
      }
    }

    setBusy(true);
    const photoN = parseInt(photoCount, 10);
    if (Number.isNaN(photoN) || photoN < 0) {
      setBusy(false);
      return setError("Photos count must be a number ≥ 0.");
    }

    const result = await createTask({
      customerIds,
      name: name.trim(),
      description: description.trim() || undefined,
      duration_min: dur,
      compulsory,
      sort_order: ord,
      photo_count: photoN,
      // Photos compulsory MIRRORS task compulsory by design — see
      // the state declaration comment. Sending `compulsory` here
      // keeps the DB row's two flags in lock-step.
      photos_compulsory: compulsory,
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
            Tasks can apply to <b style={{ color: AC.ink }}>all customers</b> (universal),{" "}
            <b style={{ color: AC.ink }}>several customers</b>, or just{" "}
            <b style={{ color: AC.ink }}>one</b>. Reps see them on their phone during a
            shift at the matching customer. Mark{" "}
            <b style={{ color: AC.ink }}>Compulsory</b> for tasks that must be done before
            check-out.
          </div>

          <Field label="Applies to" required>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <ScopeButton
                active={scope === "all"}
                onClick={() => setScope("all")}
                title="All customers"
                sub="One row · universal task"
              />
              <ScopeButton
                active={scope === "specific"}
                onClick={() => setScope("specific")}
                title="Specific customers"
                sub="Pick one or many"
              />
            </div>

            {scope === "specific" && (
              <div
                style={{
                  border: `1px solid ${AC.line}`,
                  borderRadius: 10,
                  background: "#fff",
                  maxHeight: 240,
                  overflowY: "auto",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 12px",
                    borderBottom: `1px solid ${AC.lineDim}`,
                    background: AC.bg,
                  }}
                >
                  <span
                    style={{
                      fontFamily: AC.font,
                      fontSize: 11,
                      color: AC.mute,
                      fontWeight: 600,
                    }}
                  >
                    {selectedIds.size} of {customers.length} selected
                  </span>
                  <div style={{ flex: 1 }} />
                  <button
                    type="button"
                    onClick={selectAll}
                    style={linkBtn}
                  >
                    Select all
                  </button>
                  <span style={{ color: AC.faint }}>·</span>
                  <button
                    type="button"
                    onClick={clearAll}
                    style={linkBtn}
                  >
                    Clear
                  </button>
                </div>

                {loading ? (
                  <div
                    style={{
                      padding: 14,
                      fontFamily: AC.font,
                      fontSize: 12.5,
                      color: AC.mute,
                      textAlign: "center",
                    }}
                  >
                    Loading customers…
                  </div>
                ) : customers.length === 0 ? (
                  <div
                    style={{
                      padding: 14,
                      fontFamily: AC.font,
                      fontSize: 12.5,
                      color: AC.mute,
                      textAlign: "center",
                    }}
                  >
                    No customers yet. Add one first.
                  </div>
                ) : (
                  customers.map((c) => {
                    const checked = selectedIds.has(c.id);
                    return (
                      <label
                        key={c.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "9px 12px",
                          borderBottom: `1px solid ${AC.lineDim}`,
                          cursor: "pointer",
                          background: checked ? AC.brandSoft : "#fff",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleCustomer(c.id)}
                          style={{ width: 16, height: 16, accentColor: AC.brand }}
                        />
                        <CustomerSwatch customer={c} size={22} />
                        <span
                          style={{
                            flex: 1,
                            minWidth: 0,
                            fontFamily: AC.font,
                            fontSize: 13,
                            color: AC.ink,
                            fontWeight: 500,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {c.name}
                        </span>
                        <span
                          style={{
                            fontFamily: AC.font,
                            fontSize: 11.5,
                            color: AC.mute,
                          }}
                        >
                          #{c.code}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
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

          {/* Photos requirement — Feature C (May 13). Single field
              for the count; the compulsory flag is unified with
              the task's existing "Required" toggle above so the
              two stay consistent. (Previously a separate "Photos
              compulsory" toggle led to confusing combinations like
              "task required but photos optional".) */}
          <div style={{ marginBottom: 14 }}>
            <Field
              label="Photos required"
              hint={
                parseInt(photoCount, 10) > 0
                  ? compulsory
                    ? "The rep must capture this many photos before they can complete the task (because the task is marked Required above)."
                    : "The rep is prompted to capture this many photos. They can still complete the task without them while Required is off."
                  : "Number of photos the rep must capture during this task. 0 = no photos. Photos surface as camera slots on the rep app and feed into client-facing reports later."
              }
            >
              <input
                value={photoCount}
                onChange={(e) =>
                  setPhotoCount(e.target.value.replace(/[^0-9]/g, ""))
                }
                inputMode="numeric"
                style={{ ...inputStyle, fontFamily: AC.fontMono }}
              />
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
              disabled={busy}
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
          <div style={{ padding: 16 }}>
            <div
              style={{
                fontFamily: AC.font,
                fontSize: 11,
                color: AC.mute,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: 0.3,
                marginBottom: 6,
              }}
            >
              Applies to
            </div>
            <div
              style={{
                padding: "8px 11px",
                borderRadius: 8,
                background: scope === "all" ? AC.brandSoft : AC.bg,
                border: `1px solid ${scope === "all" ? AC.brand + "55" : AC.line}`,
                fontFamily: AC.font,
                fontSize: 13,
                color: AC.ink,
                fontWeight: 600,
                marginBottom: 14,
              }}
            >
              {previewLabel}
              {scope === "specific" && selectedIds.size > 1 && (
                <div
                  style={{
                    fontFamily: AC.font,
                    fontSize: 11,
                    color: AC.mute,
                    fontWeight: 500,
                    marginTop: 3,
                  }}
                >
                  {selectedIds.size} rows will be created (one per customer).
                </div>
              )}
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
        </Card>
      </div>
    </AdminShell>
  );
}

const linkBtn: React.CSSProperties = {
  background: "transparent",
  border: "none",
  cursor: "pointer",
  fontFamily: AC.font,
  fontSize: 11,
  color: AC.brandDeep,
  fontWeight: 600,
  padding: "2px 4px",
};

function ScopeButton({
  active,
  onClick,
  title,
  sub,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  sub: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        padding: "10px 12px",
        borderRadius: 10,
        background: active ? AC.brandSoft : "#fff",
        border: `1px solid ${active ? AC.brand : AC.line}`,
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      <div
        style={{
          fontFamily: AC.font,
          fontSize: 13,
          fontWeight: 600,
          color: active ? AC.brandInk : AC.ink,
          letterSpacing: -0.1,
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontFamily: AC.font,
          fontSize: 11,
          color: active ? AC.brandDeep : AC.mute,
          marginTop: 2,
        }}
      >
        {sub}
      </div>
    </button>
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
