"use client";

/**
 * Admin Tasks page — real data.
 *
 * Lists every task across all customers (joined with customer info).
 * Filters: All / Universal / By customer (dropdown). Each row has Edit
 * (→ /tasks/[id]/edit) and Delete (inline confirm). New tasks come
 * from /tasks/new.
 *
 * Mobile uses these tasks on /active during a shift at a given customer.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AdminShell } from "@/components/shell/AdminShell";
import { Btn } from "@/components/ui/Btn";
import { Card } from "@/components/ui/Card";
import { AGlyph } from "@/components/ui/AGlyph";
import { FilterChip } from "@/components/ui/Filters";
import { Combobox } from "@/components/ui/Combobox";
import { AC } from "@/lib/tokens";
import { listAllTasks, deleteTask, type TaskRow } from "@/lib/tasks-store";

export default function TasksPage() {
  const [rows, setRows] = useState<TaskRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<"all" | "compulsory" | "optional">(
    "all"
  );
  const [customerFilter, setCustomerFilter] = useState<string>("All");
  // Free-text filter — matches against task name, description, and
  // joined customer name. Mirrors the search input on /customers and
  // /reps so every list page in the admin uses the same affordance.
  const [search, setSearch] = useState<string>("");

  const reload = () => {
    listAllTasks().then((r) => {
      setRows(r);
      setLoaded(true);
    });
  };
  useEffect(() => {
    reload();
  }, []);

  const customers = useMemo(() => {
    const set = new Map<string, string>();
    for (const r of rows) {
      if (r.customers) set.set(r.customers.id, r.customers.name);
    }
    return Array.from(set.entries()).map(([id, name]) => ({ id, name }));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (activeFilter === "compulsory" && !r.compulsory) return false;
      if (activeFilter === "optional" && r.compulsory) return false;
      if (customerFilter === "Universal") {
        if (r.customer_id !== null) return false;
      } else if (customerFilter !== "All") {
        // Universal tasks always show under any specific-customer filter too,
        // since they apply to that customer.
        if (r.customer_id !== null && r.customers?.id !== customerFilter) return false;
      }
      if (q) {
        const hay = [
          r.name,
          r.description || "",
          r.customers?.name || "",
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, activeFilter, customerFilter, search]);

  const onDelete = async (t: TaskRow) => {
    if (!confirm(`Delete task "${t.name}" from ${t.customers?.name || "this customer"}?`)) {
      return;
    }
    setBusyId(t.id);
    const r = await deleteTask(t.id);
    setBusyId(null);
    if (!r.ok) {
      alert(`Couldn't delete: ${r.error}`);
      return;
    }
    setRows((rs) => rs.filter((x) => x.id !== t.id));
  };

  const compulsoryCount = rows.filter((r) => r.compulsory).length;
  const optionalCount = rows.filter((r) => !r.compulsory).length;

  return (
    <AdminShell
      breadcrumbs={["Home", "Tasks"]}
      actions={
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/tasks/new" style={{ textDecoration: "none" }}>
            <Btn icon="plus" kind="primary" size="sm">
              New task
            </Btn>
          </Link>
        </div>
      }
    >
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Pro upgrade tiles. May 14 — replaced the legacy module
            switcher (Time & Attendance / Sales Orders / Auditing)
            with these in-context upgrade prompts. Both sit on top of
            the Tasks page because they're the natural "more task
            capability" sells (audit trails, line-item ordering).
            Decorative only — clicking opens a placeholder modal.
            When we wire real Pro tier billing, swap the onClick to
            the upgrade flow. */}
        <ProUpgradeStrip />

        <Card padding={12}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <FilterChip
              active={activeFilter === "all"}
              onClick={() => setActiveFilter("all")}
            >
              All <span style={{ color: AC.mute, fontWeight: 500 }}>· {rows.length}</span>
            </FilterChip>
            <FilterChip
              active={activeFilter === "compulsory"}
              onClick={() => setActiveFilter("compulsory")}
            >
              Compulsory · {compulsoryCount}
            </FilterChip>
            <FilterChip
              active={activeFilter === "optional"}
              onClick={() => setActiveFilter("optional")}
            >
              Optional · {optionalCount}
            </FilterChip>
            <div style={{ flex: 1 }} />
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "5px 10px",
                background: AC.bg,
                border: `1px solid ${AC.line}`,
                borderRadius: 8,
                width: 220,
              }}
            >
              <AGlyph name="search" size={13} color={AC.hint} />
              <input
                placeholder="Name, description, or customer…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  flex: 1,
                  border: "none",
                  outline: "none",
                  background: "transparent",
                  fontFamily: AC.font,
                  fontSize: 12.5,
                  color: AC.ink,
                }}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  style={{
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                    display: "flex",
                  }}
                >
                  <AGlyph name="x" size={12} color={AC.hint} />
                </button>
              )}
            </div>
            <Combobox
              value={customerFilter}
              onChange={(v) => setCustomerFilter(v ?? "All")}
              clearable={false}
              triggerIcon="customer"
              options={[
                { value: "All", label: "All customers" },
                { value: "Universal", label: "Universal", sublabel: "All-customers tasks" },
                ...customers.map((c) => ({ value: c.id, label: c.name, icon: "customer" })),
              ]}
            />
          </div>
        </Card>

        <Card padding={0}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "2.4fr 1.6fr 100px 100px 80px 90px",
              gap: 14,
              padding: "10px 16px",
              background: AC.bg,
              borderBottom: `1px solid ${AC.line}`,
              fontFamily: AC.font,
              fontSize: 11,
              color: AC.mute,
              fontWeight: 600,
              letterSpacing: 0.3,
              textTransform: "uppercase",
            }}
          >
            <div>Task</div>
            <div>Customer</div>
            <div>Duration</div>
            <div>Type</div>
            <div>Order</div>
            <div></div>
          </div>

          {!loaded ? (
            <div
              style={{
                padding: 28,
                fontFamily: AC.font,
                fontSize: 13,
                color: AC.mute,
                textAlign: "center",
              }}
            >
              Loading tasks…
            </div>
          ) : filtered.length === 0 ? (
            <div
              style={{
                padding: 36,
                fontFamily: AC.font,
                fontSize: 13,
                color: AC.mute,
                textAlign: "center",
              }}
            >
              {rows.length === 0 ? (
                <>
                  No tasks defined yet.
                  <br />
                  <span style={{ fontSize: 11.5 }}>
                    Click <b style={{ color: AC.ink2 }}>New task</b> to add one for a customer.
                  </span>
                </>
              ) : (
                "No tasks match this filter."
              )}
            </div>
          ) : (
            filtered.map((t) => (
              <div
                key={t.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "2.4fr 1.6fr 100px 100px 80px 90px",
                  gap: 14,
                  alignItems: "center",
                  padding: "12px 16px",
                  borderBottom: `1px solid ${AC.lineDim}`,
                  background: "#fff",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                  <div
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 6,
                      background: t.compulsory ? AC.dangerTint : AC.brandSoft,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <AGlyph
                      name="check"
                      size={13}
                      color={t.compulsory ? AC.danger : AC.brandDeep}
                    />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontFamily: AC.font,
                        fontSize: 13,
                        fontWeight: 600,
                        color: AC.ink,
                        letterSpacing: -0.1,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {t.name}
                    </div>
                    {t.description && (
                      <div
                        style={{
                          fontFamily: AC.font,
                          fontSize: 11.5,
                          color: AC.mute,
                          marginTop: 2,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {t.description}
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  {t.customer_id === null ? (
                    <span
                      style={{
                        padding: "3px 9px",
                        borderRadius: 99,
                        background: AC.brandSoft,
                        color: AC.brandInk,
                        fontFamily: AC.font,
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: 0.3,
                        textTransform: "uppercase",
                      }}
                    >
                      All customers
                    </span>
                  ) : (
                    <>
                      {t.customers && (
                        <div
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: 5,
                            background: t.customers.color,
                            color: "#fff",
                            fontFamily: AC.font,
                            fontSize: 9,
                            fontWeight: 700,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          {t.customers.initials}
                        </div>
                      )}
                      <div
                        style={{
                          fontFamily: AC.font,
                          fontSize: 12,
                          color: AC.ink2,
                          fontWeight: 500,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {t.customers?.name || t.customer_id}
                      </div>
                    </>
                  )}
                </div>
                <div
                  style={{
                    fontFamily: AC.fontMono,
                    fontSize: 12,
                    color: AC.ink2,
                    fontWeight: 600,
                  }}
                >
                  {t.duration_min}m
                </div>
                <div>
                  <span
                    style={{
                      padding: "2px 8px",
                      borderRadius: 99,
                      fontFamily: AC.font,
                      fontSize: 10.5,
                      fontWeight: 700,
                      letterSpacing: 0.3,
                      textTransform: "uppercase",
                      background: t.compulsory ? AC.dangerTint : AC.brandSoft,
                      color: t.compulsory ? AC.danger : AC.brandDeep,
                    }}
                  >
                    {t.compulsory ? "Compulsory" : "Optional"}
                  </span>
                </div>
                <div
                  style={{
                    fontFamily: AC.fontMono,
                    fontSize: 12,
                    color: AC.mute,
                    fontWeight: 600,
                  }}
                >
                  {t.sort_order}
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 4 }}>
                  <Link
                    href={`/tasks/${t.id}/edit`}
                    title="Edit task"
                    aria-label="Edit task"
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 6,
                      background: "transparent",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      textDecoration: "none",
                    }}
                  >
                    <AGlyph name="edit" size={14} color={AC.mute} />
                  </Link>
                  <button
                    type="button"
                    onClick={() => onDelete(t)}
                    disabled={busyId === t.id}
                    title="Delete task"
                    aria-label="Delete task"
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 6,
                      background: "transparent",
                      border: "none",
                      cursor: busyId === t.id ? "not-allowed" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      opacity: busyId === t.id ? 0.4 : 1,
                    }}
                  >
                    <AGlyph name="x" size={14} color={AC.mute} />
                  </button>
                </div>
              </div>
            ))
          )}
        </Card>
      </div>
    </AdminShell>
  );
}

/**
 * Two-tile strip showing Morpheus Ops Pro upgrades that build on
 * Core tasks. Visual-only for now — `alert()` is the placeholder
 * "interest signal" until the billing flow exists. Both tiles
 * deliberately live INSIDE /tasks (not as separate top-level nav
 * items) so reps + managers see them in the context of their
 * normal task work.
 */
function ProUpgradeStrip() {
  return (
    <Card padding={14}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 10,
        }}
      >
        <div
          style={{
            fontFamily: AC.font,
            fontSize: 10,
            fontWeight: 700,
            color: AC.brand,
            letterSpacing: 1,
            textTransform: "uppercase",
            padding: "2px 7px",
            background: `${AC.brand}22`,
            borderRadius: 4,
          }}
        >
          Pro
        </div>
        <div
          style={{
            fontFamily: AC.font,
            fontSize: 12.5,
            color: AC.mute,
            letterSpacing: -0.05,
          }}
        >
          Upgrade Tasks with more capability
        </div>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
        }}
      >
        <UpgradeTile
          glyph="audit"
          title="Advanced Auditing"
          subtitle="Tamper-proof activity trail, custom audit reports, scheduled exports."
        />
        <UpgradeTile
          glyph="building"
          title="Sales Orders"
          subtitle="Reps capture line-item orders on-site, sync to your back office."
        />
      </div>
    </Card>
  );
}

function UpgradeTile({
  glyph,
  title,
  subtitle,
}: {
  glyph: "audit" | "building";
  title: string;
  subtitle: string;
}) {
  const onClick = () => {
    // Placeholder. When real billing lands, route to the upgrade flow
    // with a `source=tasks-{slug}` query param so we can attribute
    // conversions back to which tile drove them.
    alert(
      `${title} is part of Morpheus Ops Pro — coming soon.\n\nTalk to us if you'd like early access.`
    );
  };
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        textAlign: "left",
        padding: 14,
        borderRadius: 10,
        background: AC.bg,
        border: `1px dashed ${AC.line}`,
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        position: "relative",
        // Slightly muted opacity to read as "locked" without making
        // the text unreadable. The lock glyph + Pro badge carry the
        // real "you can't use this yet" signal.
        opacity: 0.92,
      }}
    >
      {/* Lock badge — top-right corner */}
      <div
        style={{
          position: "absolute",
          top: 10,
          right: 10,
          width: 22,
          height: 22,
          borderRadius: 6,
          background: AC.card,
          border: `1px solid ${AC.line}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        aria-label="Locked"
      >
        <AGlyph name="lock" size={12} color={AC.mute} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            background: AC.card,
            border: `1px solid ${AC.line}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <AGlyph name={glyph} size={18} color={AC.brand} />
        </div>
        <div
          style={{
            fontFamily: AC.font,
            fontSize: 14,
            fontWeight: 700,
            color: AC.ink,
            letterSpacing: -0.1,
          }}
        >
          {title}
        </div>
      </div>
      <div
        style={{
          fontFamily: AC.font,
          fontSize: 12.5,
          color: AC.mute,
          lineHeight: 1.45,
          paddingRight: 32,
        }}
      >
        {subtitle}
      </div>
      <div
        style={{
          marginTop: 4,
          fontFamily: AC.font,
          fontSize: 12,
          fontWeight: 600,
          color: AC.brand,
          letterSpacing: -0.05,
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
        }}
      >
        Upgrade to unlock
        <AGlyph name="chev-r" size={12} color={AC.brand} />
      </div>
    </button>
  );
}
