"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminShell } from "@/components/shell/AdminShell";
import { Btn } from "@/components/ui/Btn";
import { Card, SectionTitle } from "@/components/ui/Card";
import { TabHeader } from "@/components/ui/TabHeader";
import { AGlyph, type GlyphName } from "@/components/ui/AGlyph";
import { AC } from "@/lib/tokens";
import { supabase } from "@/lib/supabase";
import { type Profile, displayName } from "@/lib/profiles-store";
import { listShiftsForRep, shiftHref, type ShiftRow } from "@/lib/shifts-store";
import { listAllTasks, type TaskRow } from "@/lib/tasks-store";
import { SegTabs } from "@/components/ui/SegTabs";
import { PageLoading } from "@/components/ui/PageLoading";
import Link from "next/link";
import { listCustomers } from "@/lib/customers-store";
import {
  listCustomersForRep,
  setCustomersForRep,
} from "@/lib/assignments-store";
import { CustomFieldsCard } from "@/components/ui/CustomFieldsCard";
import { FilterChip, inputStyle } from "@/components/ui/Filters";
import { initialsFromNameOrEmail, formatTimeRange, formatRelative, formatDate } from "@/lib/format";
import type { Customer } from "@/lib/types";
import { EmailUserModal } from "@/components/users/EmailUserModal";

const deriveInitials = (name: string, email: string) =>
  initialsFromNameOrEmail(name, email);

function formatJoined(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

// Local formatTimeRange removed — use shared helper from lib/format.ts.

export default function RepDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = use(params);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [allCustomers, setAllCustomers] = useState<Customer[]>([]);
  const [assignedCustomerIds, setAssignedCustomerIds] = useState<string[]>([]);
  const [savingAssignments, setSavingAssignments] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [tab, setTab] = useState<"Today" | "History" | "Tasks" | "Customers">(
    "Today"
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase) {
        setLoading(false);
        return;
      }
      const { data: profileData, error: profileErr } = await supabase
        .from("profiles")
        .select("id, email, name, role, created_at")
        .eq("id", id)
        .maybeSingle();
      if (cancelled) return;
      if (profileErr || !profileData) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setProfile(profileData as Profile);

      // This rep's full shift timeline (newest first), the customer
      // roster, their existing assignments, and the task catalogue —
      // fetched together so the tabbed detail (Today · History ·
      // Tasks · Customers) has everything it needs in one pass.
      const [repShifts, customers, assigned, allTasks] = await Promise.all([
        listShiftsForRep(id),
        listCustomers(),
        listCustomersForRep(id),
        listAllTasks(),
      ]);
      if (cancelled) return;
      setShifts(repShifts);
      setAllCustomers(customers);
      setAssignedCustomerIds(assigned);
      setTasks(allTasks);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <AdminShell breadcrumbs={["Home", "Reps", "…"]}>
        <PageLoading label="Loading rep…" />
      </AdminShell>
    );
  }

  if (notFound || !profile) {
    return (
      <AdminShell breadcrumbs={["Home", "Reps", "Not found"]}>
        <div style={{ padding: 32 }}>
          <Card padding={24}>
            <div style={{ fontFamily: AC.font, fontSize: 14, color: AC.ink, marginBottom: 8 }}>
              No rep found with this ID.
            </div>
            <div style={{ fontFamily: AC.font, fontSize: 12, color: AC.mute, marginBottom: 16 }}>
              They may have been deleted, or the link is from an older version of the app.
            </div>
            <Btn onClick={() => router.push("/reps")}>Back to Reps</Btn>
          </Card>
        </div>
      </AdminShell>
    );
  }

  const name = displayName(profile);
  const initials = deriveInitials(profile.name || "", profile.email);
  const todayISO = new Date().toISOString().slice(0, 10);
  const todayShifts = shifts.filter((s) => s.shift_date === todayISO);
  // Today panel stats are TODAY-scoped (the full-history counts now
  // live on the History tab, so an "all-time completed" number here
  // would mislead).
  const todayInProgress = todayShifts.filter(
    (s) => s.state === "in-progress"
  ).length;
  const todayCompleted = todayShifts.filter(
    (s) => s.state === "complete"
  ).length;

  // History = completed shifts, newest first (the listShiftsForRep
  // query already ordered shift_date desc, start_time desc). The rep's
  // track record across all time (Rayhaan R4 + R6).
  const history = shifts.filter((s) => s.state === "complete");

  // Tasks applicable to this rep = universal tasks (customer_id NULL)
  // + tasks defined at any customer they're assigned to. Read-only
  // here; editing happens on the Tasks page.
  const assignedSet = new Set(assignedCustomerIds);
  const applicableTasks = tasks.filter(
    (t) => t.customer_id === null || assignedSet.has(t.customer_id)
  );

  const tabCounts: Record<string, number> = {
    Today: todayShifts.length,
    History: history.length,
    Tasks: applicableTasks.length,
    Customers: assignedCustomerIds.length,
  };

  return (
    <AdminShell
      breadcrumbs={["Home", "Reps", name]}
      actions={
        <div style={{ display: "flex", gap: 8 }}>
          <Btn
            icon="mail"
            size="sm"
            onClick={() => setEmailModalOpen(true)}
          >
            Email
          </Btn>
          <Btn
            icon="edit"
            kind="primary"
            size="sm"
            onClick={() => router.push(`/settings/managers/${id}/edit`)}
          >
            Edit
          </Btn>
        </div>
      }
    >
      <div style={{ padding: 20 }}>
        {/* Persistent profile + custom-fields rail on the left; tabbed
            activity (Today · History · Tasks · Customers) on the right
            — Rayhaan R4 + R6. */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "320px 1fr",
            gap: 16,
            alignItems: "start",
          }}
        >
          {/* ── Left rail: identity + custom fields ───────────────── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Card padding={20}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
              {profile.avatar_url ? (
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 99,
                    overflow: "hidden",
                    background: "#fff",
                    boxShadow: `0 0 0 1px ${AC.line}`,
                    flexShrink: 0,
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={profile.avatar_url}
                    alt=""
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  />
                </div>
              ) : (
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 99,
                    background: AC.brand,
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: AC.font,
                    fontSize: 20,
                    fontWeight: 700,
                    letterSpacing: 0.5,
                    flexShrink: 0,
                  }}
                >
                  {initials}
                </div>
              )}
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: AC.font,
                    fontSize: 17,
                    fontWeight: 700,
                    color: AC.ink,
                    letterSpacing: -0.3,
                  }}
                >
                  {name}
                </div>
                <div style={{ fontFamily: AC.font, fontSize: 12, color: AC.mute, marginTop: 2 }}>
                  {profile.role === "manager" ? "Manager" : "Field Rep"}
                </div>
                <div style={{ marginTop: 6 }}>
                  <span
                    style={{
                      padding: "3px 9px",
                      borderRadius: 99,
                      background: AC.okTint,
                      color: "#0F5A38",
                      fontFamily: AC.font,
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  >
                    ● Active
                  </span>
                </div>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 10,
                paddingTop: 14,
                borderTop: `1px solid ${AC.line}`,
              }}
            >
              <DetailRow icon="mail" label="Email" value={profile.email} />
              <DetailRow icon="cal" label="Joined" value={formatJoined(profile.created_at)} />
              {/* Rayhaan R5 (May 28): "Last active" = most recent
                  shift check-in for this rep. Computed inline from
                  the already-loaded shifts array (no extra fetch).
                  Falls back to "Never" when the rep hasn't checked
                  into any shift yet. */}
              <DetailRow
                icon="clock"
                label="Last active"
                value={(() => {
                  const ts = shifts
                    .map((s) => s.check_in_at)
                    .filter((x): x is string => !!x)
                    .sort()
                    .pop();
                  return ts ? formatRelative(ts, " ago") : "Never";
                })()}
              />
              <DetailRow
                icon="info"
                label="Role"
                value={profile.role.charAt(0).toUpperCase() + profile.role.slice(1)}
              />
              {profile.role === "rep" && profile.rep_type && (
                <DetailRow
                  icon="reps"
                  label="Type"
                  value={profile.rep_type}
                />
              )}
            </div>
          </Card>

          <CustomFieldsCard entity="rep" entityId={profile.id} />
          </div>

          {/* ── Right column: tabbed activity (Rayhaan R4 + R6) ───── */}
          <div>
            <div style={{ marginBottom: 14 }}>
              <SegTabs
                tabs={["Today", "History", "Tasks", "Customers"] as const}
                active={tab}
                onChange={(t) => setTab(t as typeof tab)}
                counts={tabCounts}
              />
            </div>

            {/* Today — today-scoped stats + schedule */}
            {tab === "Today" && (
              <Card padding={16}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
                    gap: 12,
                    marginBottom: 16,
                  }}
                >
                  <MiniStat label="Today" value={`${todayShifts.length}`} tone="ok" />
                  <MiniStat
                    label="In progress"
                    value={`${todayInProgress}`}
                    tone="ok"
                  />
                  <MiniStat
                    label="Completed"
                    value={`${todayCompleted}`}
                    tone="neutral"
                  />
                </div>
                {todayShifts.length === 0 ? (
                  <EmptyPanel text="No shifts assigned to this rep today." />
                ) : (
                  <div
                    style={{
                      border: `1px solid ${AC.line}`,
                      borderRadius: 10,
                      overflow: "hidden",
                    }}
                  >
                    {todayShifts.map((s, i) => (
                      <ShiftLine
                        key={s.id}
                        shift={s}
                        last={i === todayShifts.length - 1}
                      />
                    ))}
                  </div>
                )}
              </Card>
            )}

            {/* History — completed shifts, newest first */}
            {tab === "History" && (
              <Card padding={16}>
                <SectionTitle>Completed shifts</SectionTitle>
                {history.length === 0 ? (
                  <EmptyPanel text="No completed shifts yet. Once this rep checks out of a shift it lands here, newest first." />
                ) : (
                  <>
                    <div
                      style={{
                        border: `1px solid ${AC.line}`,
                        borderRadius: 10,
                        overflow: "hidden",
                      }}
                    >
                      {history.map((s, i) => (
                        <ShiftLine
                          key={s.id}
                          shift={s}
                          showDate
                          last={i === history.length - 1}
                        />
                      ))}
                    </div>
                    {shifts.length >= 500 && (
                      <div
                        style={{
                          marginTop: 10,
                          fontFamily: AC.font,
                          fontSize: 11.5,
                          color: AC.mute,
                        }}
                      >
                        Showing this rep&rsquo;s most recent 500 shifts.
                      </div>
                    )}
                  </>
                )}
              </Card>
            )}

            {/* Tasks — universal + assigned-customer tasks (read-only) */}
            {tab === "Tasks" && (
              <Card padding={16}>
                <SectionTitle>Tasks for this rep</SectionTitle>
                {applicableTasks.length === 0 ? (
                  <EmptyPanel text="No tasks apply to this rep yet. Tasks are defined per customer (or universally) on the Tasks page." />
                ) : (
                  <TaskGroups tasks={applicableTasks} customers={allCustomers} />
                )}
              </Card>
            )}

            {/* Customers — assigned-customers editor */}
            {tab === "Customers" && (
            <Card padding={0}>
            <TabHeader
              title="Assigned customers"
              count={assignedCustomerIds.length}
              action={
                savingAssignments ? (
                  <span style={{ fontFamily: AC.font, fontSize: 11, color: AC.mute }}>
                    Saving…
                  </span>
                ) : null
              }
            />
            <div style={{ padding: 16 }}>
              {assignError && (
                <div
                  style={{
                    marginBottom: 10,
                    padding: "8px 10px",
                    background: AC.dangerTint,
                    color: "#9c1a3c",
                    borderRadius: 8,
                    fontFamily: AC.font,
                    fontSize: 12,
                  }}
                >
                  {assignError}
                </div>
              )}
              {allCustomers.length === 0 ? (
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
                  No customers yet. Add one first via the Customers page.
                </div>
              ) : (
                <CustomerMultiSelect
                  customers={allCustomers}
                  selectedIds={assignedCustomerIds}
                  onChange={async (next) => {
                    setSavingAssignments(true);
                    setAssignError(null);
                    const r = await setCustomersForRep(id, next);
                    setSavingAssignments(false);
                    if (!r.ok) {
                      setAssignError(r.error || "Failed to update assignments.");
                      return;
                    }
                    setAssignedCustomerIds(next);
                  }}
                />
              )}
            </div>
          </Card>
            )}
          </div>
        </div>
      </div>

      {emailModalOpen && (
        <EmailUserModal
          userId={profile.id}
          userName={name}
          userEmail={profile.email}
          lastSentAt={profile.last_credentials_sent_at ?? null}
          onClose={() => setEmailModalOpen(false)}
          onSent={() => {
            setProfile((p) =>
              p ? { ...p, last_credentials_sent_at: new Date().toISOString() } : p
            );
          }}
        />
      )}
    </AdminShell>
  );
}

function DetailRow({ icon, label, value }: { icon: GlyphName; label: string; value: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div
        style={{
          width: 24,
          height: 24,
          borderRadius: 6,
          background: AC.bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <AGlyph name={icon} size={12} color={AC.mute} />
      </div>
      <div
        style={{
          fontFamily: AC.font,
          fontSize: 11,
          color: AC.mute,
          fontWeight: 600,
          width: 60,
        }}
      >
        {label}
      </div>
      <div
        style={{
          flex: 1,
          fontFamily: AC.font,
          fontSize: 12.5,
          color: AC.ink,
          fontWeight: 500,
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "ok" | "warn" | "neutral";
}) {
  const tc = { ok: AC.ok, warn: AC.warn, neutral: AC.mute }[tone];
  return (
    <div
      style={{
        padding: 12,
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
          letterSpacing: 0.2,
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
      <div style={{ fontFamily: AC.font, fontSize: 11, color: tc, fontWeight: 600, marginTop: 2 }}>
        &nbsp;
      </div>
    </div>
  );
}

function CustomerMultiSelect({
  customers,
  selectedIds,
  onChange,
}: {
  customers: Customer[];
  selectedIds: string[];
  onChange: (next: string[]) => void | Promise<void>;
}) {
  const set = new Set(selectedIds);
  // Default to the ASSIGNED view (Gary, May 28: "it's showing me ALL
  // of them not who's assigned — most important is to show assigned,
  // then let me choose more"). "Assign more" flips to the All view
  // where the full searchable roster is pickable.
  const [mode, setMode] = useState<"assigned" | "all">("assigned");
  const [search, setSearch] = useState("");

  const toggle = (cid: string) => {
    const next = new Set(set);
    if (next.has(cid)) next.delete(cid);
    else next.add(cid);
    onChange(Array.from(next));
  };

  const q = search.trim().toLowerCase();
  const matchesSearch = (c: Customer) =>
    !q ||
    c.name.toLowerCase().includes(q) ||
    String(c.code).toLowerCase().includes(q);

  // Assigned view shows only the rep's customers; All view shows the
  // whole roster (to add more). Search narrows whichever list is up.
  const visible = customers
    .filter((c) => (mode === "assigned" ? set.has(c.id) : true))
    .filter(matchesSearch);

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
  return (
    <div
      style={{
        border: `1px solid ${AC.line}`,
        borderRadius: 10,
        background: "#fff",
        overflow: "hidden",
      }}
    >
      {/* Assigned / All toggle + count — FilterChip family so it
          matches the rest of the admin. Default = Assigned. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 12px",
          borderBottom: `1px solid ${AC.lineDim}`,
          background: AC.bg,
          flexWrap: "wrap",
        }}
      >
        <FilterChip
          active={mode === "assigned"}
          onClick={() => setMode("assigned")}
        >
          Assigned · {selectedIds.length}
        </FilterChip>
        <FilterChip active={mode === "all"} onClick={() => setMode("all")}>
          All customers · {customers.length}
        </FilterChip>
        <div style={{ flex: 1 }} />
        {mode === "all" && selectedIds.length > 0 && (
          <button type="button" onClick={() => onChange([])} style={linkBtn}>
            Clear all
          </button>
        )}
      </div>

      {/* Search — every list-view gets one (Gary's standing rule). */}
      <div style={{ padding: "8px 12px", borderBottom: `1px solid ${AC.lineDim}` }}>
        <div style={{ position: "relative" }}>
          <span
            style={{
              position: "absolute",
              left: 10,
              top: "50%",
              transform: "translateY(-50%)",
              display: "flex",
              pointerEvents: "none",
            }}
          >
            <AGlyph name="search" size={13} color={AC.hint} />
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              mode === "assigned"
                ? "Search assigned customers…"
                : "Search all customers to assign…"
            }
            style={{ ...inputStyle, paddingLeft: 30 }}
          />
        </div>
      </div>

      <div style={{ maxHeight: 320, overflowY: "auto" }}>
      {visible.length === 0 ? (
        <div
          style={{
            padding: "18px 14px",
            fontFamily: AC.font,
            fontSize: 12.5,
            color: AC.mute,
            textAlign: "center",
            lineHeight: 1.5,
          }}
        >
          {mode === "assigned" ? (
            q ? (
              <>No assigned customers match &quot;{search}&quot;.</>
            ) : (
              <>
                No customers assigned yet. Tap{" "}
                <b style={{ color: AC.ink2 }}>All customers</b> above to assign
                some.
              </>
            )
          ) : (
            <>No customers match &quot;{search}&quot;.</>
          )}
        </div>
      ) : (
        visible.map((c) => {
        const checked = set.has(c.id);
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
              onChange={() => toggle(c.id)}
              style={{ width: 16, height: 16, accentColor: AC.brand }}
            />
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: 5,
                background: c.color,
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
              {c.initials}
            </div>
            <div
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
            </div>
            <span style={{ fontFamily: AC.font, fontSize: 11.5, color: AC.mute }}>
              #{c.code}
            </span>
          </label>
        );
        })
      )}
      </div>
    </div>
  );
}

/**
 * One shift row — shared by the Today and History tabs so both lists
 * look identical. `showDate` adds a date column (History); `last`
 * suppresses the trailing divider. Routes via shiftHref so a still-
 * scheduled shift opens its edit form and everything else opens the
 * read-only detail.
 */
function ShiftLine({
  shift,
  showDate,
  last,
}: {
  shift: ShiftRow;
  showDate?: boolean;
  last?: boolean;
}) {
  const stateColor =
    shift.state === "complete"
      ? AC.ok
      : shift.state === "in-progress"
      ? AC.brandDeep
      : AC.mute;
  return (
    <Link
      href={shiftHref(shift)}
      style={{
        display: "grid",
        gridTemplateColumns: showDate
          ? "minmax(0,1fr) 92px 112px 52px 84px"
          : "minmax(0,1fr) 112px 52px 96px",
        gap: 10,
        alignItems: "center",
        padding: "10px 14px",
        borderBottom: last ? "none" : `1px solid ${AC.lineDim}`,
        background: "#fff",
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        {shift.customers && (
          <div
            style={{
              width: 22,
              height: 22,
              borderRadius: 5,
              background: shift.customers.color,
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
            {shift.customers.initials}
          </div>
        )}
        <div
          style={{
            fontFamily: AC.font,
            fontSize: 12.5,
            color: AC.ink,
            fontWeight: 600,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {shift.customers?.name || shift.customer_id}
        </div>
      </div>
      {showDate && (
        <div
          style={{ fontFamily: AC.font, fontSize: 11.5, color: AC.mute, fontWeight: 600 }}
        >
          {formatDate(shift.shift_date)}
        </div>
      )}
      <div style={{ fontFamily: AC.font, fontSize: 12, color: AC.ink2, fontWeight: 600 }}>
        {formatTimeRange(shift.start_time, shift.end_time)}
      </div>
      <div
        style={{ fontFamily: AC.font, fontSize: 11.5, color: AC.mute, fontWeight: 600 }}
        title="Tasks completed / total"
      >
        {shift.tasks_done}/{shift.tasks_total}
      </div>
      <div
        style={{
          fontFamily: AC.font,
          fontSize: 11,
          fontWeight: 600,
          color: stateColor,
          textTransform: "capitalize",
        }}
      >
        {shift.state.replace("-", " ")}
      </div>
    </Link>
  );
}

/** Shared empty-state panel for the tabs. */
function EmptyPanel({ text }: { text: string }) {
  return (
    <div
      style={{
        padding: 20,
        background: AC.bg,
        borderRadius: 10,
        fontFamily: AC.font,
        fontSize: 13,
        color: AC.mute,
        textAlign: "center",
        lineHeight: 1.5,
      }}
    >
      {text}
    </div>
  );
}

/**
 * Tasks tab body — groups the rep's applicable tasks by customer
 * (universal tasks first, then one section per assigned customer that
 * has tasks). Read-only; the catalogue is edited on the Tasks page.
 */
function TaskGroups({
  tasks,
  customers,
}: {
  tasks: TaskRow[];
  customers: Customer[];
}) {
  const byId = new Map(customers.map((c) => [c.id, c]));
  const universal = tasks.filter((t) => t.customer_id === null);
  const groups = new Map<string, TaskRow[]>();
  for (const t of tasks) {
    if (t.customer_id === null) continue;
    const list = groups.get(t.customer_id) || [];
    list.push(t);
    groups.set(t.customer_id, list);
  }
  const sections: {
    key: string;
    label: string;
    sub: string;
    color?: string;
    initials?: string;
    items: TaskRow[];
  }[] = [];
  if (universal.length > 0) {
    sections.push({
      key: "__universal__",
      label: "All customers",
      sub: "Universal — applies everywhere",
      items: universal,
    });
  }
  for (const [cid, items] of groups.entries()) {
    const c = byId.get(cid);
    sections.push({
      key: cid,
      label: c?.name || cid,
      sub: c ? `#${c.code}` : "",
      color: c?.color,
      initials: c?.initials,
      items,
    });
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {sections.map((sec) => (
        <div key={sec.key}>
          <div
            style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}
          >
            {sec.color ? (
              <div
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 5,
                  background: sec.color,
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
                {sec.initials}
              </div>
            ) : (
              <div
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 5,
                  background: AC.brandSoft,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <AGlyph name="tasks" size={11} color={AC.brandDeep} />
              </div>
            )}
            <div style={{ fontFamily: AC.font, fontSize: 12.5, fontWeight: 700, color: AC.ink }}>
              {sec.label}
            </div>
            <div style={{ fontFamily: AC.font, fontSize: 11, color: AC.mute }}>{sec.sub}</div>
          </div>
          <div style={{ border: `1px solid ${AC.line}`, borderRadius: 10, overflow: "hidden" }}>
            {sec.items.map((t, i) => (
              <div
                key={t.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 12px",
                  borderBottom:
                    i < sec.items.length - 1 ? `1px solid ${AC.lineDim}` : "none",
                  background: "#fff",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: AC.font, fontSize: 12.5, color: AC.ink, fontWeight: 600 }}>
                    {t.name}
                  </div>
                  {t.description && (
                    <div
                      style={{
                        fontFamily: AC.font,
                        fontSize: 11,
                        color: AC.mute,
                        marginTop: 1,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {t.description}
                    </div>
                  )}
                </div>
                <span
                  style={{
                    fontFamily: AC.font,
                    fontSize: 10.5,
                    fontWeight: 700,
                    color: t.compulsory ? "#9c1a3c" : AC.mute,
                    background: t.compulsory ? AC.dangerTint : AC.bg,
                    padding: "2px 7px",
                    borderRadius: 99,
                    whiteSpace: "nowrap",
                  }}
                >
                  {t.compulsory ? "Required" : "Optional"}
                </span>
                {t.duration_min > 0 && (
                  <span
                    style={{ fontFamily: AC.font, fontSize: 11, color: AC.mute, fontWeight: 600 }}
                  >
                    {t.duration_min}m
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
