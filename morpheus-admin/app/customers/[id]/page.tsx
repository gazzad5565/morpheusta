"use client";

/**
 * Customer detail — real data, tabbed.
 *
 * Tabs:
 *   - Overview: header + at-a-glance counts
 *   - Address: MapLibre map + address text + geofence radius slider
 *   - Reps: assigned reps multi-select
 *   - Tasks: customer's task templates
 *   - Library: files attached to this customer
 *   - Shifts: today's shifts at this customer
 *   - Custom fields: dynamic admin-defined fields
 */

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AdminShell } from "@/components/shell/AdminShell";
import { Btn } from "@/components/ui/Btn";
import { Card, SectionTitle } from "@/components/ui/Card";
import { AGlyph, type GlyphName } from "@/components/ui/AGlyph";
import { LoadingBar, Spinner } from "@/components/ui/LoadingBar";
import { SitesTab } from "@/components/customers/SitesTab";
import { CustomerSwatch } from "@/components/ui/Avatars";
import {
  listSitesForCustomer,
  type CustomerSite,
} from "@/lib/sites-store";

// MapLibre needs `window`; client-only.
const AddressMap = dynamic(
  () => import("@/components/CustomerAddressMap").then((m) => m.CustomerAddressMap),
  { ssr: false }
);
import { AC } from "@/lib/tokens";
import {
  getCustomer,
  setCustomerActive,
  deleteCustomer,
  updateCustomer,
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
import { listShifts, shiftHref, type ShiftRow } from "@/lib/shifts-store";
import { CustomFieldsCard } from "@/components/ui/CustomFieldsCard";
import type { Customer } from "@/lib/types";

type TabKey = "overview" | "sites" | "reps" | "tasks" | "library" | "shifts" | "custom";

const TABS: { key: TabKey; label: string; glyph: GlyphName }[] = [
  { key: "overview", label: "Overview", glyph: "info" },
  { key: "sites", label: "Sites", glyph: "pin" },
  { key: "reps", label: "Reps", glyph: "reps" },
  { key: "tasks", label: "Tasks", glyph: "tasks" },
  { key: "library", label: "Library", glyph: "lib" },
  { key: "shifts", label: "Today's shifts", glyph: "cal" },
  { key: "custom", label: "Custom fields", glyph: "settings" },
];

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

  const [activeTab, setActiveTab] = useState<TabKey>("overview");

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [customerRow, reps, repIds, taskRows, fileRows, shiftRows] = await Promise.all([
        getCustomer(id),
        listProfiles({ role: "rep" }),
        listRepsForCustomer(id),
        listTasksForCustomer(id),
        listLibraryFilesForCustomer(id),
        listShifts({ limit: 200 }),
      ]);
      if (cancelled) return;
      setC(customerRow);
      setAllReps(reps);
      setAssignedRepIds(repIds);
      setTasks(taskRows);
      setFiles(fileRows);
      setShifts(shiftRows.filter((s) => s.customer_id === id));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
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
          Customer not found.
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
    if (!window.confirm(`Permanently delete "${c!.name}"? This can't be undone.`)) return;
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
      {loading && <LoadingBar />}
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
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

        {/* Header card — visible on every tab */}
        <Card padding={20}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
            <CustomerSwatch customer={c} size={56} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <button
                type="button"
                onClick={() => router.push(`/customers/${id}/edit`)}
                title="Edit customer"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: 0,
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: AC.font,
                  fontSize: 19,
                  fontWeight: 700,
                  color: AC.ink,
                  letterSpacing: -0.4,
                  textAlign: "left",
                }}
              >
                <span>{c.name}</span>
                <AGlyph name="edit" size={13} color={AC.hint} />
              </button>
              <div
                style={{ fontFamily: AC.font, fontSize: 12, color: AC.mute, marginTop: 2 }}
              >
                Account #{c.code} · {c.region || "—"}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <Pill
                  label={isActive ? "● Active" : "● Inactive"}
                  bg={isActive ? AC.okTint : AC.bg}
                  fg={isActive ? "#0F5A38" : AC.mute}
                />
                <Pill
                  label={`${assignedRepIds.length} rep${assignedRepIds.length === 1 ? "" : "s"}`}
                  bg={AC.bg}
                  fg={AC.ink2}
                />
                <Pill
                  label={`${tasks.length} task${tasks.length === 1 ? "" : "s"}`}
                  bg={AC.bg}
                  fg={AC.ink2}
                />
                <Pill
                  label={`${files.length} file${files.length === 1 ? "" : "s"}`}
                  bg={AC.bg}
                  fg={AC.ink2}
                />
              </div>
            </div>
          </div>
        </Card>

        {/* Tab bar */}
        <div
          style={{
            display: "flex",
            gap: 4,
            borderBottom: `1px solid ${AC.line}`,
            overflowX: "auto",
          }}
        >
          {TABS.map((t) => {
            const active = activeTab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setActiveTab(t.key)}
                style={{
                  padding: "10px 14px",
                  background: "transparent",
                  border: "none",
                  borderBottom: active
                    ? `2px solid ${AC.ink}`
                    : "2px solid transparent",
                  marginBottom: -1,
                  cursor: "pointer",
                  fontFamily: AC.font,
                  fontSize: 13,
                  fontWeight: 700,
                  color: active ? AC.ink : AC.mute,
                  letterSpacing: -0.1,
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  whiteSpace: "nowrap",
                }}
              >
                <AGlyph name={t.glyph} size={13} color={active ? AC.ink : AC.mute} />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        {activeTab === "overview" && (
          <OverviewTab
            customer={c}
            stats={{
              repsAssigned: assignedRepIds.length,
              tasks: tasks.length,
              files: files.length,
              shiftsToday: shifts.length,
            }}
            onJumpToSites={() => setActiveTab("sites")}
          />
        )}

        {activeTab === "sites" && <SitesTab customer={c} />}

        {activeTab === "reps" && (
          <RepsTab
            allReps={allReps}
            assignedRepIds={assignedRepIds}
            saving={savingAssignments}
            onSave={onSaveAssignments}
          />
        )}

        {activeTab === "tasks" && (
          <TasksTab
            customerId={id}
            tasks={tasks}
            taskBusyId={taskBusyId}
            onDeleteTask={onDeleteTask}
          />
        )}

        {activeTab === "library" && (
          <LibraryTab files={files} onOpen={onOpenFile} />
        )}

        {activeTab === "shifts" && (
          <ShiftsTab shifts={shifts} customerId={id} />
        )}

        {activeTab === "custom" && (
          <CustomFieldsCard entity="customer" entityId={id} />
        )}
      </div>
    </AdminShell>
  );
}

// ─── Tab components ─────────────────────────────────────────────────────

function OverviewTab({
  customer,
  stats,
  onJumpToSites,
}: {
  customer: Customer;
  stats: {
    repsAssigned: number;
    tasks: number;
    files: number;
    shiftsToday: number;
  };
  onJumpToSites: () => void;
}) {
  // Load sites for the head-office card (the oldest active site is the
  // head office; the rest list as "additional sites" below). Loaded
  // here rather than threaded as a prop because OverviewTab is a leaf
  // component and the small extra fetch keeps the parent simple.
  const [sites, setSites] = useState<CustomerSite[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    listSitesForCustomer(customer.id).then((rows) => {
      if (!cancelled) setSites(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [customer.id]);

  const headOffice = useMemo(
    () => (sites ?? []).find((s) => s.active) ?? null,
    [sites]
  );
  const additional = useMemo(
    () => (sites ?? []).filter((s) => s.active && s.id !== headOffice?.id),
    [sites, headOffice]
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>
        {/* Left: Quick summary */}
        <Card padding={20}>
          <SectionTitle>Quick summary</SectionTitle>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: 12,
              marginTop: 12,
            }}
          >
            <Stat label="Reps assigned" value={stats.repsAssigned} />
            <Stat label="Tasks defined" value={stats.tasks} />
            <Stat label="Library files" value={stats.files} />
            <Stat label="Shifts today" value={stats.shiftsToday} />
          </div>
          <div
            style={{
              marginTop: 16,
              padding: "12px 14px",
              background: AC.brandSoft,
              borderRadius: 10,
              fontFamily: AC.font,
              fontSize: 12.5,
              color: AC.brandInk,
              lineHeight: 1.5,
            }}
          >
            Use the tabs above to manage this customer&apos;s sites
            (locations + geofences), assigned reps, tasks, library
            files, today&apos;s shifts, and any custom fields you&apos;ve
            defined in Settings.
          </div>
        </Card>

        {/* Right: Head office card — the customer's primary location.
            Map + geofence circle render by default. Click the address
            chip or the action button to jump straight to the Sites tab. */}
        <Card padding={0}>
          <div
            style={{
              padding: "14px 16px",
              borderBottom: `1px solid ${AC.lineDim}`,
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <span
              style={{
                fontFamily: AC.font,
                fontSize: 11,
                fontWeight: 700,
                color: AC.mute,
                letterSpacing: 0.4,
                textTransform: "uppercase",
              }}
            >
              Head office
            </span>
            <div style={{ flex: 1 }} />
            <Btn size="sm" icon="settings" onClick={onJumpToSites}>
              {sites && sites.length > 1
                ? `Manage ${sites.filter((s) => s.active).length} sites`
                : "Edit"}
            </Btn>
          </div>

          {sites === null ? (
            <div
              style={{
                height: 240,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                color: AC.mute,
                fontFamily: AC.font,
                fontSize: 12.5,
              }}
            >
              <Spinner size={14} /> Loading head office…
            </div>
          ) : headOffice ? (
            <>
              <div style={{ overflow: "hidden" }}>
                {headOffice.latitude != null && headOffice.longitude != null ? (
                  <AddressMap
                    lat={headOffice.latitude}
                    lng={headOffice.longitude}
                    radiusM={headOffice.geofence_radius_m ?? 100}
                    color={customer.color}
                    initials={customer.initials}
                    height={220}
                  />
                ) : (
                  <div
                    style={{
                      height: 220,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexDirection: "column",
                      fontFamily: AC.font,
                      color: AC.mute,
                      fontSize: 13,
                      gap: 8,
                      background: "#F1F4F7",
                    }}
                  >
                    <AGlyph name="pin" size={26} color={AC.faint} />
                    <div>No coordinates yet</div>
                    <Btn size="sm" icon="edit" onClick={onJumpToSites}>
                      Add an address
                    </Btn>
                  </div>
                )}
              </div>
              <div style={{ padding: "12px 16px 16px" }}>
                <div
                  style={{
                    fontFamily: AC.font,
                    fontSize: 13.5,
                    color: AC.ink,
                    fontWeight: 600,
                    lineHeight: 1.45,
                  }}
                >
                  {headOffice.address || (
                    <span style={{ fontWeight: 500, color: AC.mute, fontStyle: "italic" }}>
                      No address yet — open Sites to add one.
                    </span>
                  )}
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    marginTop: 8,
                    fontFamily: AC.font,
                    fontSize: 11.5,
                    color: AC.mute,
                  }}
                >
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <AGlyph name="pin" size={11} color={AC.mute} />
                    Geofence · {headOffice.geofence_radius_m ?? 100} m
                  </span>
                  {headOffice.latitude != null && headOffice.longitude != null && (
                    <span style={{ fontFamily: AC.fontMono }}>
                      {headOffice.latitude.toFixed(4)}, {headOffice.longitude.toFixed(4)}
                    </span>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div
              style={{
                padding: 24,
                textAlign: "center",
                fontFamily: AC.font,
                fontSize: 13,
                color: AC.mute,
              }}
            >
              No sites yet.
              <div style={{ marginTop: 10 }}>
                <Btn size="sm" icon="plus" kind="primary" onClick={onJumpToSites}>
                  Add head office
                </Btn>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Additional sites — only renders when the customer has more
          than just the head office. Compact row per site, click to
          jump to the Sites tab for full CRUD. */}
      {additional.length > 0 && (
        <Card padding={0}>
          <div
            style={{
              padding: "12px 16px",
              borderBottom: `1px solid ${AC.lineDim}`,
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <span
              style={{
                fontFamily: AC.font,
                fontSize: 11,
                fontWeight: 700,
                color: AC.mute,
                letterSpacing: 0.4,
                textTransform: "uppercase",
              }}
            >
              Additional sites
            </span>
            <span
              style={{
                padding: "2px 8px",
                borderRadius: 99,
                background: AC.bg,
                color: AC.mute,
                fontFamily: AC.font,
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              {additional.length}
            </span>
            <div style={{ flex: 1 }} />
            <Btn size="sm" icon="settings" onClick={onJumpToSites}>
              Manage
            </Btn>
          </div>
          <div>
            {additional.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={onJumpToSites}
                style={{
                  display: "flex",
                  width: "100%",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 16px",
                  background: "transparent",
                  border: "none",
                  borderBottom:
                    i < additional.length - 1 ? `1px solid ${AC.lineDim}` : "none",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: AC.brandSoft,
                    color: AC.brandDeep,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <AGlyph name="pin" size={14} color={AC.brandDeep} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: AC.font,
                      fontSize: 13.5,
                      fontWeight: 700,
                      color: AC.ink,
                      letterSpacing: -0.2,
                    }}
                  >
                    {s.name}
                  </div>
                  <div
                    style={{
                      fontFamily: AC.font,
                      fontSize: 12,
                      color: AC.mute,
                      marginTop: 2,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {s.address || "No address yet"}
                    {" · Geofence "}
                    {s.geofence_radius_m ?? 100} m
                  </div>
                </div>
                <AGlyph name="chev-r" size={14} color={AC.hint} />
              </button>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}


function RepsTab({
  allReps,
  assignedRepIds,
  saving,
  onSave,
}: {
  allReps: Profile[];
  assignedRepIds: string[];
  saving: boolean;
  onSave: (next: string[]) => void;
}) {
  return (
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
        {saving && (
          <span style={{ fontFamily: AC.font, fontSize: 11, color: AC.mute }}>Saving…</span>
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
          <RepMultiSelect reps={allReps} selectedIds={assignedRepIds} onChange={onSave} />
        )}
      </div>
    </Card>
  );
}

function TasksTab({
  customerId,
  tasks,
  taskBusyId,
  onDeleteTask,
}: {
  customerId: string;
  tasks: TaskRow[];
  taskBusyId: string | null;
  onDeleteTask: (t: TaskRow) => void;
}) {
  return (
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
        <SectionTitle>Tasks at this customer</SectionTitle>
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
          href={`/tasks/new?customer=${customerId}`}
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
            text="No tasks defined yet."
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
                borderBottom: i < tasks.length - 1 ? `1px solid ${AC.lineDim}` : "none",
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
                <Link href={`/tasks/${t.id}/edit`} title="Edit task" style={iconBtn}>
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
  );
}

function LibraryTab({
  files,
  onOpen,
}: {
  files: LibraryFile[];
  onOpen: (f: LibraryFile) => void;
}) {
  return (
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
        <SectionTitle>Library files for this customer</SectionTitle>
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
              onClick={() => onOpen(f)}
              style={{
                width: "100%",
                display: "grid",
                gridTemplateColumns: "1fr 110px 80px 80px",
                gap: 14,
                alignItems: "center",
                padding: "12px 16px",
                borderBottom: i < files.length - 1 ? `1px solid ${AC.lineDim}` : "none",
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
              <div style={{ display: "flex", justifyContent: "flex-end", color: AC.mute }}>
                <AGlyph name="chev-r" size={14} color={AC.mute} />
              </div>
            </button>
          ))
        )}
      </div>
    </Card>
  );
}

function ShiftsTab({ shifts, customerId }: { shifts: ShiftRow[]; customerId: string }) {
  return (
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
        <SectionTitle>Shifts at this customer (today)</SectionTitle>
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
        <div style={{ flex: 1 }} />
        <Link
          href={`/schedule/new?customer=${customerId}`}
          style={{ textDecoration: "none" }}
        >
          <Btn size="sm" icon="plus">
            Schedule
          </Btn>
        </Link>
      </div>
      <div>
        {shifts.length === 0 ? (
          <Empty text="No shifts scheduled at this customer today." />
        ) : (
          shifts.map((s, i) => (
            <Link
              key={s.id}
              href={shiftHref(s)}
              style={{
                display: "grid",
                gridTemplateColumns: "140px 1fr 110px",
                gap: 14,
                alignItems: "center",
                padding: "10px 16px",
                borderBottom: i < shifts.length - 1 ? `1px solid ${AC.lineDim}` : "none",
                background: "#fff",
                textDecoration: "none",
                color: "inherit",
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
                    Rep ↗
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
            </Link>
          ))
        )}
      </div>
    </Card>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function Pill({ label, bg, fg }: { label: string; bg: string; fg: string }) {
  return (
    <span
      style={{
        padding: "3px 9px",
        borderRadius: 99,
        background: bg,
        color: fg,
        fontFamily: AC.font,
        fontSize: 11,
        fontWeight: 700,
      }}
    >
      {label}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div
      style={{
        padding: "12px 14px",
        borderRadius: 10,
        background: AC.bg,
        border: `1px solid ${AC.line}`,
      }}
    >
      <div
        style={{
          fontFamily: AC.font,
          fontSize: 11,
          color: AC.mute,
          fontWeight: 600,
          letterSpacing: 0.3,
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: AC.font,
          fontSize: 22,
          fontWeight: 700,
          color: AC.ink,
          letterSpacing: -0.6,
          marginTop: 4,
        }}
      >
        {value}
      </div>
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
      {sub && <div style={{ fontSize: 11.5, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

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
        maxHeight: 320,
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
        <span style={{ fontFamily: AC.font, fontSize: 11, color: AC.mute, fontWeight: 600 }}>
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
