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
            <select
              value={customerFilter}
              onChange={(e) => setCustomerFilter(e.target.value)}
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                border: `1px solid ${AC.line}`,
                background: "#fff",
                fontFamily: AC.font,
                fontSize: 12,
                color: AC.ink,
                cursor: "pointer",
              }}
            >
              <option value="All">All customers</option>
              <option value="Universal">Universal (all-customers tasks)</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
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
