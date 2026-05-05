"use client";

/**
 * Customer detail — real data.
 *
 * Shows:
 *   - Header card with name, code, address, status, active toggle, edit/delete
 *   - Assigned reps editor (multi-select, edits rep_customer_assignments)
 *   - Tasks for this customer (real customer_tasks rows; "+ Add task")
 *   - Library files for this customer (real library_files rows; "+ Upload" → /library)
 *   - Recent shifts (last 30 days, real shifts rows)
 *
 * The geofence/sites mock UI from the previous version is gone — those
 * fields aren't yet schema-backed.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AdminShell } from "@/components/shell/AdminShell";
import { Btn } from "@/components/ui/Btn";
import { Card, SectionTitle } from "@/components/ui/Card";
import { AGlyph, type GlyphName } from "@/components/ui/AGlyph";
import { CustomerSwatch } from "@/components/ui/Avatars";
import { AC } from "@/lib/tokens";
import {
  getCustomer,
  setCustomerActive,
  deleteCustomer,
} from "@/lib/customers-store";
import { listProfiles, displayName, type Profile } from "@/lib/profiles-store";
import {
  listRepsForCustomer,
  setRepsForCustomer,
} from "@/lib/assignments-store";
import { listTasksForCustomer, deleteTask, type TaskRow } from "@/lib/tasks-store";
import {
  listLibraryFilesForCustomer,
  getLibraryDownloadUrl,
  formatFileSize,
  type LibraryFile,
} from "@/lib/library-store";
import { listShifts, type ShiftRow } from "@/lib/shifts-store";
import type { Customer } from "@/lib/types";

function formatTimeRange(start: string, end: string): string {
  const fmt = (t: string) => {
    if (!t) return "";
    const [hh, mm] = t.split(":");
    const h = parseInt(hh, 10);
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = ((h + 11) % 12) + 1;
    return `${h12}:${mm} ${ampm}`;
  };
  return `${fmt(start)} – ${fmt(end)}`;
}

function deriveInitials(p: Profile): string {
  const src = p.name?.trim() || p.email.split("@")[0] || "?";
  const parts = src.split(/\s+|[._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return parts[0]?.slice(0, 2).toUpperCase() || "??";
}

export default function CustomerDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [c, setC] = useState<Customer | null>(null);
  const [allReps, setAllReps] = useState<Profile[]>([]);
  const [assignedRepIds, setAssignedRepIds] = useState<string[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [files, setFiles] = useState<LibraryFile[]>([]);
  const [shifts, setShifts] = useState<ShiftRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [savingAssignments, setSavingAssignments] = useState(false);
  const [taskBusyId, setTaskBusyId] = useState<string | null>(null);

  // Load everything for this customer in parallel.
  const reload = async (alsoLoadCustomer = true) => {
    const [customerRow, reps, repIds, taskRows, fileRows, shiftRows] = await Promise.all([
      alsoLoadCustomer ? getCustomer(id) : Promise.resolve(c),
      listProfiles({ role: "rep" }),
      listRepsForCustomer(id),
      listTasksForCustomer(id),
      listLibraryFilesForCustomer(id),
      // Shifts table doesn't have a "for customer" helper; fetch a wide
      // window of recent shifts and filter client-side. Cheap at small scale.
      listShifts({ limit: 200 }),
    ]);
    if (alsoLoadCustomer) setC(customerRow);
    setAllReps(reps);
    setAssignedRepIds(repIds);
    setTasks(taskRows);
    setFiles(fileRows);
    setShifts(shiftRows.filter((s) => s.customer_id === id));
    setLoading(false);
  };

  useEffect(() => {
    reload(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) {
    return (
      <AdminShell breadcrumbs={["Home", "Customers", "…"]}>
        <div style={{ padding: 20, color: AC.mute, fontFamily: AC.font }}>Loading…</div>
      </AdminShell>
    );
  }

  if (!c) {
    return (
      <AdminShell breadcrumbs={["Home", "Customers", "Not found"]}>
        <div style={{ padding: 20, color: AC.danger, fontFamily: AC.font }}>
          Customer not found. It may have been deleted, or you may need to log in.
        </div>
      </AdminShell>
    );
  }

  const isActive = c.active !== false;

  async function onToggleActive() {
    if (busy || !c) return;
    setActionError(null);
    setBusy(true);
    const result = await setCustomerActive(id, !isActive);
    setBusy(false);
    if (!result.ok) {
      setActionError(result.error || "Failed to update status.");
      return;
    }
    setC({ ...c, active: !isActive });
  }

  async function onDelete() {
    if (busy) return;
    const ok = window.confirm(
      `Permanently delete "${c!.name}"? This can't be undone.`
    );
    if (!ok) return;
    setActionError(null);
    setBusy(true);
    const result = await deleteCustomer(id);
    setBusy(false);
    if (!result.ok) {
      setActionError(result.error || "Failed to delete.");
      return;
    }
    router.push("/customers");
  }

  async function onSaveAssignments(newIds: string[]) {
    setSavingAssignments(true);
    setActionError(null);
    const r = await setRepsForCustomer(id, newIds);
    setSavingAssignments(false);
    if (!r.ok) {
      setActionError(r.error || "Failed to update reps.");
      return;
    }
    setAssignedRepIds(newIds);
  }

  async function onDeleteTask(t: TaskRow) {
    if (!confirm(`Delete task "${t.name}"?`)) return;
    setTaskBusyId(t.id);
    const r = await deleteTask(t.id);
    setTaskBusyId(null);
    if (!r.ok) {
      alert(`Couldn't delete: ${r.error}`);
      return;
    }
    setTasks((arr) => arr.filter((x) => x.id !== t.id));
  }

  async function onOpenFile(f: LibraryFile) {
    const r = await getLibraryDownloadUrl(f.storagePath);
    if (!r.ok || !r.url) {
      alert(`Couldn't open: ${r.error}`);
      return;
    }
    window.open(r.url, "_blank", "noopener,noreferrer");
  }

  return (
    <AdminShell
      breadcrumbs={["Home", "Customers", { label: c.name }]}
      actions={
        <div style={{ display: "flex", gap: 8 }}>
          <Btn icon="edit" size="sm" onClick={() => router.push(`/customers/${id}/edit`)}>
            Edit
          </Btn>
          {isActive ? (
            <Btn size="sm" onClick={onToggleActive} disabled={busy}>
              {busy ? "…" : "Deactivate"}
            </Btn>
          ) : (
            <Btn size="sm" kind="primary" onClick={onToggleActive} disabled={busy}>
              {busy ? "…" : "Reactivate"}
            </Btn>
          )}
          <Btn size="sm" kind="danger" onClick={onDelete} disabled={busy}>
            Delete
          </Btn>
        </div>
      }
    >
      <div
        style={{
          padding: 20,
          display: "grid",
          gridTemplateColumns: "1fr 360px",
          gap: 16,
          alignItems: "start",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {actionError && (
            <div
              style={{
                padding: "10px 12px",
                background: AC.dangerTint,
                color: "#9c1a3c",
                borderRadius: 10,
                fontFamily: AC.font,
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              {actionError}
            </div>
          )}

          {/* Header card */}
          <Card padding={20}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
              <CustomerSwatch customer={c} size={56} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: AC.font,
                    fontSize: 19,
                    fontWeight: 700,
                    color: AC.ink,
                    letterSpacing: -0.4,
                  }}
                >
                  {c.name}
                </div>
                <div
                  style={{ fontFamily: AC.font, fontSize: 12, color: AC.mute, marginTop: 2 }}
                >
                  Account #{c.code} · {c.region || "—"}
                </div>
                {c.address && (
                  <div
                    style={{
                      fontFamily: AC.font,
                      fontSize: 12.5,
                      color: AC.ink2,
                      fontWeight: 500,
                      marginTop: 6,
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <AGlyph name="pin" size={12} color={AC.mute} />
                    {c.address}
                    {c.latitude != null && c.longitude != null && (
                      <span
                        style={{
                          fontFamily: AC.fontMono,
                          fontSize: 11,
                          color: AC.mute,
                          marginLeft: 6,
                        }}
                      >
                        {c.latitude.toFixed(4)}, {c.longitude.toFixed(4)}
                      </span>
                    )}
                  </div>
                )}
                <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  <span
                    style={{
                      padding: "3px 9px",
                      borderRadius: 99,
                      background: isActive ? AC.okTint : AC.bg,
                      color: isActive ? "#0F5A38" : AC.mute,
                      fontFamily: AC.font,
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  >
                    ● {isActive ? "Active" : "Inactive"}
                  </span>
                  <span
                    style={{
                      padding: "3px 9px",
                      borderRadius: 99,
                      background: AC.bg,
                      color: AC.ink2,
                      fontFamily: AC.font,
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  >
                    {assignedRepIds.length} rep{assignedRepIds.length === 1 ? "" : "s"} assigned
                  </span>
                  <span
                    style={{
                      padding: "3px 9px",
                      borderRadius: 99,
                      background: AC.bg,
                      color: AC.ink2,
                      fontFamily: AC.font,
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  >
                    {tasks.length} task{tasks.length === 1 ? "" : "s"} defined
                  </span>
                </div>
              </div>
            </div>
          </Card>

          {/* Assigned reps editor */}
          <Card padding={0}>
            <div
              style={{
                padding: "14px 16px",
                borderBottom: `1px solid ${AC.line}`,
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <SectionTitle>Assigned reps</SectionTitle>
              <span
                style={{
                  padding: "2px 7px",
                  borderRadius: 99,
                  background: AC.bg,
                  color: AC.mute,
                  fontFamily: AC.font,
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                {assignedRepIds.length}
              </span>
              <div style={{ flex: 1 }} />
              {savingAssignments && (
                <span style={{ fontFamily: AC.font, fontSize: 11, color: AC.mute }}>
                  Saving…
                </span>
              )}
            </div>
            <div style={{ padding: 16 }}>
              {allReps.length === 0 ? (
                <div
                  style={{
                    padding: 18,
                    background: AC.bg,
                    borderRadius: 10,
                    fontFamily: AC.font,
                    fontSize: 13,
                    color: AC.mute,
                    textAlign: "center",
                  }}
                >
                  No reps yet. Reps appear here once they sign up via the mobile app.
                </div>
              ) : (
                <RepMultiSelect
                  reps={allReps}
                  selectedIds={assignedRepIds}
                  onChange={onSaveAssignments}
                />
              )}
            </div>
          </Card>

          {/* Tasks for this customer */}
          <Card padding={0}>
            <div
              style={{
                padding: "14px 16px",
                borderBottom: `1px solid ${AC.line}`,
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <SectionTitle>Tasks</SectionTitle>
              <span
                style={{
                  padding: "2px 7px",
                  borderRadius: 99,
                  background: AC.bg,
                  color: AC.mute,
                  fontFamily: AC.font,
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                {tasks.length}
              </span>
              <div style={{ flex: 1 }} />
              <Link
                href={`/tasks/new?customer=${id}`}
                style={{ textDecoration: "none" }}
              >
                <Btn size="sm" icon="plus">
                  Add task
                </Btn>
              </Link>
            </div>
            <div>
              {tasks.length === 0 ? (
                <Empty
                  text="No tasks defined for this customer."
                  sub="Tasks tell the rep what to do during a shift here."
                />
              ) : (
                tasks.map((t, i) => (
                  <div
                    key={t.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 100px 90px 60px",
                      gap: 14,
                      alignItems: "center",
                      padding: "12px 16px",
                      borderBottom:
                        i < tasks.length - 1 ? `1px solid ${AC.lineDim}` : "none",
                      background: "#fff",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontFamily: AC.font,
                          fontSize: 13,
                          fontWeight: 600,
                          color: AC.ink,
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
                          }}
                        >
                          {t.description}
                        </div>
                      )}
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
                        color: AC.ink2,
                        fontWeight: 600,
                      }}
                    >
                      ~{t.duration_min}m
                    </div>
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 4 }}>
                      <Link
                        href={`/tasks/${t.id}/edit`}
                        title="Edit task"
                        style={iconBtn}
                      >
                        <AGlyph name="edit" size={14} color={AC.mute} />
                      </Link>
                      <button
                        type="button"
                        onClick={() => onDeleteTask(t)}
                        disabled={taskBusyId === t.id}
                        title="Delete task"
                        style={{
                          ...iconBtn,
                          cursor: taskBusyId === t.id ? "not-allowed" : "pointer",
                          opacity: taskBusyId === t.id ? 0.4 : 1,
                        }}
                      >
                        <AGlyph name="x" size={14} color={AC.mute} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>

          {/* Library files for this customer */}
          <Card padding={0}>
            <div
              style={{
                padding: "14px 16px",
                borderBottom: `1px solid ${AC.line}`,
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <SectionTitle>Library</SectionTitle>
              <span
                style={{
                  padding: "2px 7px",
                  borderRadius: 99,
                  background: AC.bg,
                  color: AC.mute,
                  fontFamily: AC.font,
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                {files.length}
              </span>
              <div style={{ flex: 1 }} />
              <Link href="/library" style={{ textDecoration: "none" }}>
                <Btn size="sm">Manage all</Btn>
              </Link>
            </div>
            <div>
              {files.length === 0 ? (
                <Empty
                  text="No files for this customer."
                  sub="Upload from the Library page and pick this customer (or 'Shared with all') to attach."
                />
              ) : (
                files.map((f, i) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => onOpenFile(f)}
                    style={{
                      width: "100%",
                      display: "grid",
                      gridTemplateColumns: "1fr 110px 80px 80px",
                      gap: 14,
                      alignItems: "center",
                      padding: "12px 16px",
                      borderBottom:
                        i < files.length - 1 ? `1px solid ${AC.lineDim}` : "none",
                      background: "#fff",
                      border: "none",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <div
                      style={{
                        fontFamily: AC.font,
                        fontSize: 13,
                        fontWeight: 600,
                        color: AC.ink,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {f.name}
                    </div>
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: 99,
                        fontFamily: AC.font,
                        fontSize: 10.5,
                        fontWeight: 700,
                        background: f.customerIds === null ? AC.brandSoft : AC.bg,
                        color: f.customerIds === null ? AC.brandInk : AC.ink2,
                        border: f.customerIds === null ? "none" : `1px solid ${AC.line}`,
                        justifySelf: "start",
                      }}
                    >
                      {f.customerIds === null ? "All customers" : f.category || "—"}
                    </span>
                    <div
                      style={{
                        fontFamily: AC.fontMono,
                        fontSize: 11.5,
                        color: AC.mute,
                        fontWeight: 600,
                      }}
                    >
                      {formatFileSize(f.sizeBytes)}
                    </div>
                    <div
                      style={{ display: "flex", justifyContent: "flex-end", color: AC.mute }}
                    >
                      <AGlyph name="chev-r" size={14} color={AC.mute} />
                    </div>
                  </button>
                ))
              )}
            </div>
          </Card>

          {/* Recent shifts */}
          <Card padding={0}>
            <div
              style={{
                padding: "14px 16px",
                borderBottom: `1px solid ${AC.line}`,
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <SectionTitle>Today's shifts here</SectionTitle>
              <span
                style={{
                  padding: "2px 7px",
                  borderRadius: 99,
                  background: AC.bg,
                  color: AC.mute,
                  fontFamily: AC.font,
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                {shifts.length}
              </span>
            </div>
            <div>
              {shifts.length === 0 ? (
                <Empty text="No shifts scheduled at this customer today." />
              ) : (
                shifts.map((s, i) => (
                  <div
                    key={s.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "140px 1fr 110px",
                      gap: 14,
                      alignItems: "center",
                      padding: "10px 16px",
                      borderBottom:
                        i < shifts.length - 1 ? `1px solid ${AC.lineDim}` : "none",
                      background: "#fff",
                    }}
                  >
                    <div
                      style={{
                        fontFamily: AC.font,
                        fontSize: 12,
                        color: AC.ink2,
                        fontWeight: 600,
                      }}
                    >
                      {formatTimeRange(s.start_time, s.end_time)}
                    </div>
                    <div
                      style={{
                        fontFamily: AC.font,
                        fontSize: 12.5,
                        color: AC.ink,
                        fontWeight: 500,
                      }}
                    >
                      {s.rep_id ? (
                        <Link
                          href={`/reps/${s.rep_id}`}
                          style={{ color: AC.brandDeep, textDecoration: "none" }}
                        >
                          rep ↗
                        </Link>
                      ) : (
                        <span style={{ color: AC.mute }}>Unassigned · claimable</span>
                      )}
                    </div>
                    <div
                      style={{
                        fontFamily: AC.font,
                        fontSize: 11,
                        fontWeight: 600,
                        color:
                          s.state === "complete"
                            ? AC.ok
                            : s.state === "in-progress"
                            ? AC.brandDeep
                            : AC.mute,
                        textTransform: "capitalize",
                        textAlign: "right",
                      }}
                    >
                      {s.state.replace("-", " ")}
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>

        {/* Right column — quick stats */}
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
              At a glance
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <Kv label="Reps assigned" value={`${assignedRepIds.length}`} />
              <Kv label="Tasks defined" value={`${tasks.length}`} />
              <Kv label="Library files" value={`${files.length}`} />
              <Kv label="Shifts today" value={`${shifts.length}`} />
              <Kv
                label="Address"
                value={c.address ? "Set" : "Not set"}
                tone={c.address ? "ok" : "warn"}
              />
            </div>
          </Card>
        </div>
      </div>
    </AdminShell>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────

function RepMultiSelect({
  reps,
  selectedIds,
  onChange,
}: {
  reps: Profile[];
  selectedIds: string[];
  onChange: (next: string[]) => void;
}) {
  const set = useMemo(() => new Set(selectedIds), [selectedIds]);
  const toggle = (id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(Array.from(next));
  };
  return (
    <div
      style={{
        border: `1px solid ${AC.line}`,
        borderRadius: 10,
        background: "#fff",
        maxHeight: 280,
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
          style={{ fontFamily: AC.font, fontSize: 11, color: AC.mute, fontWeight: 600 }}
        >
          {selectedIds.length} of {reps.length} selected
        </span>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={() => onChange(reps.map((r) => r.id))}
          style={linkBtn}
        >
          Select all
        </button>
        <span style={{ color: AC.faint }}>·</span>
        <button type="button" onClick={() => onChange([])} style={linkBtn}>
          Clear
        </button>
      </div>
      {reps.map((r) => {
        const checked = set.has(r.id);
        const initials = deriveInitials(r);
        return (
          <label
            key={r.id}
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
              onChange={() => toggle(r.id)}
              style={{ width: 16, height: 16, accentColor: AC.brand }}
            />
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: 99,
                background: AC.brandDeep,
                color: "#fff",
                fontFamily: AC.font,
                fontSize: 10,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {initials}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontFamily: AC.font,
                  fontSize: 13,
                  color: AC.ink,
                  fontWeight: 500,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {displayName(r)}
              </div>
              <div
                style={{
                  fontFamily: AC.font,
                  fontSize: 11,
                  color: AC.mute,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {r.email}
              </div>
            </div>
          </label>
        );
      })}
    </div>
  );
}

function Empty({ text, sub }: { text: string; sub?: string }) {
  return (
    <div
      style={{
        padding: 28,
        fontFamily: AC.font,
        fontSize: 13,
        color: AC.mute,
        textAlign: "center",
        background: "#fff",
      }}
    >
      <div style={{ color: AC.ink2, fontWeight: 600 }}>{text}</div>
      {sub && (
        <div style={{ fontSize: 11.5, marginTop: 4 }}>{sub}</div>
      )}
    </div>
  );
}

function Kv({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn";
}) {
  const c = tone === "ok" ? AC.ok : tone === "warn" ? AC.warn : AC.ink;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: 8,
        padding: "6px 0",
      }}
    >
      <div
        style={{
          fontFamily: AC.font,
          fontSize: 11.5,
          color: AC.mute,
          fontWeight: 500,
          flex: 1,
        }}
      >
        {label}
      </div>
      <div style={{ fontFamily: AC.font, fontSize: 13.5, fontWeight: 700, color: c }}>
        {value}
      </div>
    </div>
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

const iconBtn: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 6,
  background: "transparent",
  border: "none",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  textDecoration: "none",
  cursor: "pointer",
};
