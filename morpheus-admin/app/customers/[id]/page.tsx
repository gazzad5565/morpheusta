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
import { LoadingBar } from "@/components/ui/LoadingBar";
import { CustomerSwatch } from "@/components/ui/Avatars";
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

// MapLibre needs `window`; load on client only.
const AddressMap = dynamic(
  () => import("@/components/CustomerAddressMap").then((m) => m.CustomerAddressMap),
  { ssr: false }
);

type TabKey = "overview" | "address" | "reps" | "tasks" | "library" | "shifts" | "custom";

const TABS: { key: TabKey; label: string; glyph: GlyphName }[] = [
  { key: "overview", label: "Overview", glyph: "info" },
  { key: "address", label: "Address & geofence", glyph: "pin" },
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

  // Geofence radius local state for the slider on the Address tab.
  const [geofenceRadius, setGeofenceRadius] = useState<number>(100);
  const [savingGeofence, setSavingGeofence] = useState(false);

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
      if (customerRow) setGeofenceRadius(customerRow.geofence ?? 100);
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

  async function onSaveGeofence() {
    if (savingGeofence || !c) return;
    setSavingGeofence(true);
    const r = await updateCustomer(id, { geofence_radius_m: geofenceRadius });
    setSavingGeofence(false);
    if (!r.ok) {
      setActionError(r.error || "Failed to update geofence.");
      return;
    }
    setC({ ...c, geofence: geofenceRadius });
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
          />
        )}

        {activeTab === "address" && (
          <AddressTab
            customer={c}
            geofenceRadius={geofenceRadius}
            setGeofenceRadius={setGeofenceRadius}
            saving={savingGeofence}
            onSave={onSaveGeofence}
            onEdit={() => router.push(`/customers/${id}/edit`)}
          />
        )}

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
}: {
  customer: Customer;
  stats: {
    repsAssigned: number;
    tasks: number;
    files: number;
    shiftsToday: number;
  };
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 16, alignItems: "start" }}>
      <Card padding={20}>
        <SectionTitle>Quick summary</SectionTitle>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
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
          Use the tabs above to manage this customer's address &amp; geofence, assigned reps,
          tasks, library files, today's shifts, and any custom fields you've defined in
          Settings.
        </div>
      </Card>
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
          Address
        </div>
        {customer.address ? (
          <div style={{ fontFamily: AC.font, fontSize: 13, color: AC.ink, lineHeight: 1.5 }}>
            <AGlyph name="pin" size={12} color={AC.mute} /> {customer.address}
            {customer.latitude != null && customer.longitude != null && (
              <div
                style={{
                  fontFamily: AC.fontMono,
                  fontSize: 11,
                  color: AC.mute,
                  marginTop: 4,
                }}
              >
                {customer.latitude.toFixed(4)}, {customer.longitude.toFixed(4)}
              </div>
            )}
            <div
              style={{
                fontFamily: AC.font,
                fontSize: 11,
                color: AC.mute,
                marginTop: 4,
              }}
            >
              Geofence: {customer.geofence}m
            </div>
          </div>
        ) : (
          <div style={{ fontFamily: AC.font, fontSize: 12.5, color: AC.mute }}>
            No address set yet. Open the Address tab to add one.
          </div>
        )}
      </Card>
    </div>
  );
}

function AddressTab({
  customer,
  geofenceRadius,
  setGeofenceRadius,
  saving,
  onSave,
  onEdit,
}: {
  customer: Customer;
  geofenceRadius: number;
  setGeofenceRadius: (v: number) => void;
  saving: boolean;
  onSave: () => void;
  onEdit: () => void;
}) {
  const hasCoords = customer.latitude != null && customer.longitude != null;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 16, alignItems: "start" }}>
      <Card padding={0}>
        {hasCoords ? (
          <AddressMap
            lat={customer.latitude!}
            lng={customer.longitude!}
            radiusM={geofenceRadius}
            color={customer.color}
            initials={customer.initials}
          />
        ) : (
          <div
            style={{
              height: 360,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "column",
              fontFamily: AC.font,
              color: AC.mute,
              fontSize: 13,
              gap: 10,
              background: "#F1F4F7",
            }}
          >
            <AGlyph name="pin" size={28} color={AC.faint} />
            <div>No address set yet.</div>
            <Btn icon="edit" size="sm" onClick={onEdit}>
              Set address
            </Btn>
          </div>
        )}
      </Card>

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
          Address
        </div>
        {customer.address ? (
          <div
            style={{
              fontFamily: AC.font,
              fontSize: 13,
              color: AC.ink,
              lineHeight: 1.5,
              marginBottom: 12,
            }}
          >
            {customer.address}
            {hasCoords && (
              <div
                style={{
                  fontFamily: AC.fontMono,
                  fontSize: 11,
                  color: AC.mute,
                  marginTop: 4,
                }}
              >
                {customer.latitude!.toFixed(5)}, {customer.longitude!.toFixed(5)}
              </div>
            )}
          </div>
        ) : (
          <div
            style={{
              fontFamily: AC.font,
              fontSize: 12.5,
              color: AC.mute,
              marginBottom: 12,
            }}
          >
            None yet.
          </div>
        )}
        <Btn size="sm" icon="edit" onClick={onEdit}>
          Change address
        </Btn>

        <div
          style={{
            fontFamily: AC.font,
            fontSize: 11,
            fontWeight: 600,
            color: AC.mute,
            letterSpacing: 0.4,
            textTransform: "uppercase",
            marginTop: 22,
            marginBottom: 8,
          }}
        >
          Geofence radius
        </div>
        <div style={{ fontFamily: AC.font, fontSize: 12.5, color: AC.mute, marginBottom: 10, lineHeight: 1.5 }}>
          The check-in distance allowance for reps. Smaller = stricter on-site check-in.
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <input
            type="range"
            min={25}
            max={500}
            step={5}
            value={geofenceRadius}
            onChange={(e) => setGeofenceRadius(parseInt(e.target.value, 10))}
            style={{ flex: 1, accentColor: AC.brand }}
          />
          <div
            style={{
              fontFamily: AC.fontMono,
              fontSize: 13,
              color: AC.ink,
              fontWeight: 700,
              minWidth: 56,
              textAlign: "right",
            }}
          >
            {geofenceRadius}m
          </div>
        </div>
        <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
          {[50, 75, 100, 150, 250].map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setGeofenceRadius(v)}
              style={{
                flex: 1,
                padding: "5px 0",
                borderRadius: 6,
                background: v === geofenceRadius ? AC.ink : "#fff",
                color: v === geofenceRadius ? "#fff" : AC.ink2,
                border: `1px solid ${v === geofenceRadius ? AC.ink : AC.line}`,
                fontFamily: AC.font,
                fontSize: 11,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {v}m
            </button>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
          <Btn
            kind="primary"
            size="sm"
            onClick={onSave}
            disabled={saving || customer.geofence === geofenceRadius}
          >
            {saving ? "Saving…" : "Save geofence"}
          </Btn>
        </div>
      </Card>
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
