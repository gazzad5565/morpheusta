"use client";

/**
 * Customer detail — real data, tabbed.
 *
 * Tabs:
 *   - Overview: header + at-a-glance counts
 *   - Sites: per-site CRUD with map preview
 *   - Contacts: per-customer contact list with inline CRUD
 *   - Reps: assigned reps multi-select
 *   - Tasks: customer's task templates
 *   - Library: files attached to this customer
 *   - Shifts: today's shifts at this customer
 *   - Custom fields: dynamic admin-defined fields
 *
 * Each tab lives in its own file under components/customers/ so this
 * page stays focused on data loading + the tab switch. See:
 *   - OverviewTab, ContactsTab, RepsTab, TasksTab, LibraryTab, ShiftsTab
 *   - SitesTab (was already its own file)
 */

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AdminShell } from "@/components/shell/AdminShell";
import { Btn } from "@/components/ui/Btn";
import { Card } from "@/components/ui/Card";
import { AGlyph, type GlyphName } from "@/components/ui/AGlyph";
import { LoadingBar } from "@/components/ui/LoadingBar";
import { SitesTab } from "@/components/customers/SitesTab";
import { OverviewTab } from "@/components/customers/OverviewTab";
import { ContactsTab } from "@/components/customers/ContactsTab";
import { RepsTab } from "@/components/customers/RepsTab";
import { TasksTab } from "@/components/customers/TasksTab";
import { LibraryTab } from "@/components/customers/LibraryTab";
import { ShiftsTab } from "@/components/customers/ShiftsTab";
import { CustomerSwatch } from "@/components/ui/Avatars";
import { Pill } from "@/components/ui/Pill";
import { AC } from "@/lib/tokens";
import {
  getCustomer,
  setCustomerActive,
  deleteCustomer,
  markCustomerSeen,
} from "@/lib/customers-store";
import { listProfiles, type Profile } from "@/lib/profiles-store";
import {
  listRepsForCustomer,
  setRepsForCustomer,
} from "@/lib/assignments-store";
import { listTasksForCustomer, deleteTask, type TaskRow } from "@/lib/tasks-store";
import {
  listLibraryFilesForCustomer,
  getLibraryDownloadUrl,
  type LibraryFile,
} from "@/lib/library-store";
import { listShiftsInRange, type ShiftRow } from "@/lib/shifts-store";
import { isoDaysAgo, todayLocalISO } from "@/lib/format";
import { listSitesForCustomer, type CustomerSite } from "@/lib/sites-store";
import {
  listCustomerContacts,
  type CustomerContact,
} from "@/lib/customer-contacts-store";
import { CustomFieldsCard } from "@/components/ui/CustomFieldsCard";
import type { Customer } from "@/lib/types";

type TabKey =
  | "overview"
  | "sites"
  | "contacts"
  | "reps"
  | "tasks"
  | "library"
  | "shifts"
  | "custom";

const TABS: { key: TabKey; label: string; glyph: GlyphName }[] = [
  { key: "overview", label: "Overview", glyph: "info" },
  { key: "sites", label: "Sites", glyph: "pin" },
  // Contacts sits between Sites (their place) and Reps (our people)
  // so the "who is involved" cluster reads in one sweep.
  { key: "contacts", label: "Contacts", glyph: "reps" },
  { key: "reps", label: "Reps", glyph: "reps" },
  { key: "tasks", label: "Tasks", glyph: "tasks" },
  { key: "library", label: "Library", glyph: "lib" },
  { key: "shifts", label: "Shifts", glyph: "cal" },
  { key: "custom", label: "Custom fields", glyph: "settings" },
];

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
  // Sites feed the SitesTab. Owning the fetch here means re-opening
  // the tab after CRUD doesn't re-hit the API.
  const [sites, setSites] = useState<CustomerSite[] | null>(null);
  // Primary contact for the header card (Rayhaan R7). The manager
  // stars it on the Contacts tab; null when none is marked.
  const [primaryContact, setPrimaryContact] = useState<CustomerContact | null>(
    null
  );

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [savingAssignments, setSavingAssignments] = useState(false);
  const [taskBusyId, setTaskBusyId] = useState<string | null>(null);

  // Reload sites after CRUD in the SitesTab.
  async function reloadSites() {
    const rows = await listSitesForCustomer(id, { includeInactive: true });
    setSites(rows);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [
        customerRow,
        reps,
        repIds,
        taskRows,
        fileRows,
        shiftRows,
        siteRows,
        contactRows,
      ] = await Promise.all([
        getCustomer(id),
        listProfiles({ role: "rep" }),
        listRepsForCustomer(id),
        listTasksForCustomer(id),
        listLibraryFilesForCustomer(id),
        // Shifts: last 90 days back through one year forward — wide
        // enough to cover Past + Today + Upcoming filters on the
        // ShiftsTab without an unbounded scan.
        listShiftsInRange(isoDaysAgo(90), isoDaysAgo(-365)),
        listSitesForCustomer(id, { includeInactive: true }),
        // Contacts fetched here (not just in the OverviewTab) so the
        // header card can surface the primary contact on every tab.
        // listCustomerContacts already floats is_primary to index 0.
        listCustomerContacts(id),
      ]);
      if (cancelled) return;
      setC(customerRow);
      setAllReps(reps);
      setAssignedRepIds(repIds);
      setTasks(taskRows);
      setFiles(fileRows);
      setShifts(shiftRows.filter((s) => s.customer_id === id));
      setSites(siteRows);
      setPrimaryContact(contactRows.find((ct) => ct.is_primary) ?? null);
      setLoading(false);

      // Mark this rep-added customer as "seen" by the current
      // manager so the NEW badge clears on the Customers list.
      // No-op for admin-created customers (createdByRepId null).
      // Idempotent on the DB side, fine to call every mount.
      if (customerRow?.createdByRepId) {
        void markCustomerSeen(id);
      }
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
                Account #{c.code}
              </div>

              {/* Classification chips — region / customer group / store
                  type (Rayhaan R7, May 28). These are the "what kind of
                  customer is this" facts; surfaced on the header card so
                  they're visible on EVERY tab, not buried on the edit
                  page. Each chip only renders when the value is set, so
                  an un-tagged customer shows nothing here (no "—" noise).
                  Set them via Edit → Location; vocabularies live at
                  Settings → Organisation. */}
              {(c.region || c.customerGroup || c.storeType) && (
                <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                  {c.region && <MetaChip glyph="pin" label="Region" value={c.region} />}
                  {c.customerGroup && (
                    <MetaChip glyph="customer" label="Group" value={c.customerGroup} />
                  )}
                  {c.storeType && (
                    <MetaChip glyph="building" label="Store" value={c.storeType} />
                  )}
                </div>
              )}

              {/* Primary contact — R7's "surface primary contact + phone
                  in the hero". Pulled from the customer_contacts row the
                  manager starred (ContactsTab); falls back to nothing
                  when none is marked. */}
              {primaryContact && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginTop: 8,
                    fontFamily: AC.font,
                    fontSize: 12.5,
                    color: AC.ink2,
                    flexWrap: "wrap",
                  }}
                >
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      fontWeight: 600,
                      color: AC.ink,
                    }}
                  >
                    <span style={{ color: AC.brandDeep }}>★</span>
                    {primaryContact.name}
                  </span>
                  {primaryContact.role_label && (
                    <span style={{ color: AC.mute }}>· {primaryContact.role_label}</span>
                  )}
                  {primaryContact.phone && (
                    <a
                      href={`tel:${primaryContact.phone.replace(/\s+/g, "")}`}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        color: AC.brandInk,
                        textDecoration: "none",
                        fontWeight: 500,
                      }}
                      title={`Call ${primaryContact.name}`}
                    >
                      <AGlyph name="phone" size={11} color={AC.brandDeep} />
                      {primaryContact.phone}
                    </a>
                  )}
                  {/* Clickable email → opens the manager's mail client
                      (Gary, May 28: "I should be able to email them
                      straight from looking at a customer"). */}
                  {primaryContact.email && (
                    <a
                      href={`mailto:${primaryContact.email}`}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        color: AC.brandInk,
                        textDecoration: "none",
                        fontWeight: 500,
                        wordBreak: "break-all",
                      }}
                      title={`Email ${primaryContact.name}`}
                    >
                      <AGlyph name="mail" size={11} color={AC.brandDeep} />
                      {primaryContact.email}
                    </a>
                  )}
                </div>
              )}

              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <Pill
                  bg={isActive ? AC.okTint : AC.bg}
                  fg={isActive ? "#0F5A38" : AC.mute}
                >
                  {isActive ? "● Active" : "● Inactive"}
                </Pill>
                <Pill>
                  {assignedRepIds.length} rep{assignedRepIds.length === 1 ? "" : "s"}
                </Pill>
                <Pill>
                  {tasks.length} task{tasks.length === 1 ? "" : "s"}
                </Pill>
                <Pill>
                  {files.length} file{files.length === 1 ? "" : "s"}
                </Pill>
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
                data-testid={`customer-tab-${t.key}`}
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
              // shifts now holds last 90d + upcoming year so the
              // Shifts tab can filter Past/Today/Upcoming. The
              // Overview stat still wants TODAY only — filter
              // inline rather than re-fetch.
              shiftsToday: shifts.filter((s) => s.shift_date === todayLocalISO()).length,
            }}
          />
        )}

        {activeTab === "sites" && (
          <SitesTab customer={c} sites={sites} reload={reloadSites} />
        )}

        {activeTab === "contacts" && <ContactsTab customerId={id} />}

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
          <ShiftsTab shifts={shifts} reps={allReps} customerId={id} />
        )}

        {activeTab === "custom" && (
          <CustomFieldsCard entity="customer" entityId={id} />
        )}
      </div>
    </AdminShell>
  );
}


/**
 * MetaChip — a small labelled classification chip for the customer
 * header card (Region / Customer group / Store type). Rayhaan R7,
 * May 28. The label is a faint uppercase prefix so a manager can
 * tell which dimension the value belongs to at a glance.
 */
function MetaChip({
  glyph,
  label,
  value,
}: {
  glyph: GlyphName;
  label: string;
  value: string;
}) {
  return (
    <span
      title={`${label}: ${value}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 9px",
        borderRadius: 99,
        background: AC.bg,
        border: `1px solid ${AC.line}`,
        fontFamily: AC.font,
        fontSize: 11.5,
        color: AC.ink2,
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      <AGlyph name={glyph} size={11} color={AC.mute} />
      <span
        style={{
          fontSize: 9.5,
          fontWeight: 700,
          letterSpacing: 0.4,
          textTransform: "uppercase",
          color: AC.mute,
        }}
      >
        {label}
      </span>
      {value}
    </span>
  );
}
