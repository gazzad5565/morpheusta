"use client";

/**
 * /shifts/[id] — admin shift detail page.
 *
 * Closes the loop on per-shift task completions. Shows:
 *   - Header card: customer / rep / date / times / state / counts.
 *   - Tasks card: every customer_task for this customer, with the
 *     rep's tick-off state for this specific shift (who and when),
 *     pulled from `shift_task_completions`.
 *   - Custom fields card (entity="shift").
 *
 * Linked from the Live Ops shifts list, the rep detail page's
 * "today's shifts", and any other place that lists a shift row. (More
 * call-sites can be added later — the page works standalone too.)
 */

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AdminShell } from "@/components/shell/AdminShell";
import { Btn } from "@/components/ui/Btn";
import { Card, SectionTitle } from "@/components/ui/Card";
import { AGlyph } from "@/components/ui/AGlyph";
import { CustomFieldsCard } from "@/components/ui/CustomFieldsCard";
import { AC } from "@/lib/tokens";
import {
  getShiftById,
  isShiftEditable,
  reassignShift,
  releaseShift,
  acknowledgeAttention,
  cancelShiftFromAttention,
  listRepConflictsForSlot,
  type ShiftRow,
} from "@/lib/shifts-store";
import { formatTimeRange } from "@/lib/format";
import { RepConflictAvatar } from "@/components/ui/Avatars";
import { listTasksForCustomer, type TaskRow } from "@/lib/tasks-store";
import {
  getProfileById,
  listProfiles,
  type Profile,
  displayName,
} from "@/lib/profiles-store";
import { Combobox } from "@/components/ui/Combobox";
import {
  listCompletionsForShift,
  getActiveTaskForShift,
  type ShiftTaskCompletion,
  type ActiveTask,
} from "@/lib/task-completions-store";

function attentionReasonLabel(value: string | null | undefined): string {
  switch (value) {
    case "sick":
      return "Sick / unwell";
    case "family":
      return "Family emergency";
    case "double_booked":
      return "Double-booked";
    case "transport":
      return "Transport problem";
    case "other":
      return "Other";
    default:
      return value || "Unspecified";
  }
}

function relativeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

// Local formatTimeRange removed — use shared helper from lib/format.ts.

function formatDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatCompletedAt(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const STATE_LABEL: Record<string, string> = {
  scheduled: "Scheduled",
  "in-progress": "In progress",
  complete: "Complete",
};

const STATE_TONE: Record<string, { bg: string; fg: string }> = {
  scheduled: { bg: AC.bg, fg: AC.mute },
  "in-progress": { bg: AC.brandTint, fg: AC.brandDeep },
  complete: { bg: "#dcf6e3", fg: "#1f7a3f" },
};

export default function ShiftDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const { id } = use(params);

  const [shift, setShift] = useState<ShiftRow | null>(null);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [completions, setCompletions] = useState<ShiftTaskCompletion[]>([]);
  const [rep, setRep] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  // Currently-active task for in-progress shifts. Refreshed every
  // 30s alongside the live timer so the admin sees "started 12 min
  // ago" tick up.
  const [activeTask, setActiveTask] = useState<ActiveTask | null>(null);
  // `now` is bumped every second so the live timer + active-task
  // "started X ago" labels tick. Cheap setState; only renders the
  // numeric labels.
  const [now, setNow] = useState<number>(() => Date.now());
  // Rep roster for the Reassign picker — loaded alongside the shift.
  const [reps, setReps] = useState<Profile[]>([]);
  const [attBusy, setAttBusy] = useState(false);
  const [attPickerOpen, setAttPickerOpen] = useState(false);
  const [attPickedRepId, setAttPickedRepId] = useState<string | null>(null);
  // Conflict guard for the reassign picker — see LiveFeedPanel for
  // the matching logic; loaded lazily when the picker opens.
  const [attConflictRepIds, setAttConflictRepIds] = useState<Set<string>>(
    new Set()
  );
  useEffect(() => {
    if (!attPickerOpen || !shift) return;
    let cancelled = false;
    listRepConflictsForSlot({
      shiftDate: shift.shift_date,
      startTime: shift.start_time,
      endTime: shift.end_time,
      excludeShiftId: shift.id,
    }).then((s) => {
      if (!cancelled) setAttConflictRepIds(s);
    });
    return () => {
      cancelled = true;
    };
  }, [
    attPickerOpen,
    shift?.id,
    shift?.shift_date,
    shift?.start_time,
    shift?.end_time,
  ]);
  const attPickedHasConflict =
    !!attPickedRepId && attConflictRepIds.has(attPickedRepId);

  // Reload the shift after a manager action so the banner clears (or
  // navigates away if the shift was cancelled).
  const reloadShift = async () => {
    const s = await getShiftById(id);
    if (s) setShift(s);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [s, repList] = await Promise.all([
        getShiftById(id),
        listProfiles({ role: "rep" }),
      ]);
      if (cancelled) return;
      setReps(repList);
      if (!s) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setShift(s);
      const [taskRows, comps, repProfile, active] = await Promise.all([
        listTasksForCustomer(s.customer_id),
        listCompletionsForShift(s.id),
        s.rep_id ? getProfileById(s.rep_id) : Promise.resolve(null),
        s.state === "in-progress" || s.state === "on-break"
          ? getActiveTaskForShift(s.id)
          : Promise.resolve(null),
      ]);
      if (cancelled) return;
      setTasks(taskRows);
      setCompletions(comps);
      setRep(repProfile);
      setActiveTask(active);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Live timer + periodic active-task refresh while the shift is
  // in-progress (or on-break). 1s tick for the elapsed display;
  // 30s polling re-fetches the active task in case the rep starts a
  // new one. Both intervals shut down when the shift is no longer
  // live so we don't burn battery on a completed shift's detail page.
  useEffect(() => {
    if (!shift) return;
    const live = shift.state === "in-progress" || shift.state === "on-break";
    if (!live) return;
    const tickHandle = setInterval(() => setNow(Date.now()), 1000);
    const refreshHandle = setInterval(async () => {
      const next = await getActiveTaskForShift(shift.id);
      setActiveTask(next);
    }, 30_000);
    return () => {
      clearInterval(tickHandle);
      clearInterval(refreshHandle);
    };
  }, [shift?.id, shift?.state]);

  const onAttReassign = async () => {
    if (!shift || !attPickedRepId) return;
    // Double-book guard at submit time — mirrors the Live Ops picker.
    if (attPickedHasConflict) {
      const picked = reps.find((r) => r.id === attPickedRepId);
      const name = picked ? displayName(picked) : "this rep";
      if (
        !confirm(
          `${name} already has a shift in that time slot. Reassign anyway and double-book them?`
        )
      ) {
        return;
      }
    }
    setAttBusy(true);
    const r = await reassignShift(shift.id, attPickedRepId);
    setAttBusy(false);
    if (!r.ok) {
      alert(`Couldn't reassign: ${r.error}`);
      return;
    }
    setAttPickerOpen(false);
    setAttPickedRepId(null);
    await reloadShift();
  };
  const onAttRelease = async () => {
    if (!shift) return;
    if (
      !confirm(
        `Release this shift to the claimable pool? Any rep can pick it up.`
      )
    )
      return;
    setAttBusy(true);
    const r = await releaseShift(shift.id);
    setAttBusy(false);
    if (!r.ok) {
      alert(`Couldn't release: ${r.error}`);
      return;
    }
    await reloadShift();
  };
  const onAttAcknowledge = async () => {
    if (!shift) return;
    if (
      !confirm(
        `Keep this shift with the same rep?\n\nThe rep raised "can't make it" but they'll stay assigned. They'll see a "Manager confirmed — you're still on this shift" message on their phone. Only use this if you've spoken to them and agreed they're still doing it.\n\nIf they're not doing the shift, use Reassign, Release, or Cancel instead.`
      )
    )
      return;
    setAttBusy(true);
    const r = await acknowledgeAttention(shift.id);
    setAttBusy(false);
    if (!r.ok) {
      alert(`Couldn't keep: ${r.error}`);
      return;
    }
    await reloadShift();
  };
  const onAttCancel = async () => {
    if (!shift) return;
    if (
      !confirm(
        `Cancel this shift? It'll be marked cancelled; this can't be undone here (you'd need to recreate it).`
      )
    )
      return;
    setAttBusy(true);
    const r = await cancelShiftFromAttention(shift.id);
    setAttBusy(false);
    if (!r.ok) {
      alert(`Couldn't cancel: ${r.error}`);
      return;
    }
    // After cancelling, send the admin back to the schedule so they
    // don't sit on a now-cancelled shift detail page.
    router.push("/schedule");
  };

  if (loading) {
    return (
      <AdminShell breadcrumbs={["Home", "Shifts", "…"]}>
        <div style={{ padding: 24, fontFamily: AC.font, color: AC.mute }}>
          Loading shift…
        </div>
      </AdminShell>
    );
  }

  if (notFound || !shift) {
    return (
      <AdminShell breadcrumbs={["Home", "Shifts", "Not found"]}>
        <div style={{ padding: 20 }}>
          <Card padding={24}>
            <div style={{ fontFamily: AC.font, fontSize: 14, color: AC.ink }}>
              We couldn't find that shift.
            </div>
            <div style={{ marginTop: 12 }}>
              <Btn onClick={() => router.push("/schedule")}>Back to schedule</Btn>
            </div>
          </Card>
        </div>
      </AdminShell>
    );
  }

  const customer = shift.customers;
  const customerName = customer?.name || "Unknown customer";
  const tone = STATE_TONE[shift.state] || STATE_TONE.scheduled;

  // Build a quick lookup of completions by task id.
  const compByTaskId = new Map<string, ShiftTaskCompletion>();
  for (const c of completions) compByTaskId.set(c.taskId, c);

  const compulsory = tasks.filter((t) => t.compulsory);
  const optional = tasks.filter((t) => !t.compulsory);
  const doneCount = tasks.filter((t) => compByTaskId.has(t.id)).length;
  const compulsoryDone = compulsory.filter((t) => compByTaskId.has(t.id)).length;

  const editable = isShiftEditable(shift.state);

  return (
    <AdminShell
      breadcrumbs={["Home", "Shifts", `${customerName} · ${formatDate(shift.shift_date)}`]}
      actions={
        editable ? (
          <Link href={`/shifts/${shift.id}/edit`} style={{ textDecoration: "none" }}>
            <Btn icon="edit" kind="primary" size="sm">
              Edit shift
            </Btn>
          </Link>
        ) : (
          <span
            style={{
              padding: "4px 10px",
              borderRadius: 99,
              background: AC.bg,
              color: AC.mute,
              fontFamily: AC.font,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 0.4,
              textTransform: "uppercase",
            }}
            title="Once a rep checks in, the shift becomes read-only."
          >
            Locked
          </span>
        )
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
        {/* Left: shift summary + tasks */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Attention banner — only when the rep has flagged
              unable-to-attend and the manager hasn't actioned it
              yet. The same four resolutions Live Ops shows, but in a
              roomier layout since the detail page has space. */}
          {shift.attention === "unable_to_attend" &&
            !shift.attention_resolved_at && (
              <Card padding={0}>
                <div
                  style={{
                    padding: 16,
                    background: AC.warnTint,
                    borderLeft: `4px solid ${AC.warn}`,
                    borderTopLeftRadius: 14,
                    borderTopRightRadius: 14,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      marginBottom: 6,
                    }}
                  >
                    <AGlyph name="warn" size={18} color={AC.warn} />
                    <div
                      style={{
                        fontFamily: AC.font,
                        fontSize: 14,
                        fontWeight: 700,
                        color: "#6d4808",
                        letterSpacing: -0.1,
                      }}
                    >
                      Rep is unable to attend
                    </div>
                    <span style={{ flex: 1 }} />
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: 99,
                        background: "#fff",
                        color: "#7d5708",
                        fontFamily: AC.font,
                        fontSize: 10.5,
                        fontWeight: 700,
                        letterSpacing: 0.4,
                        textTransform: "uppercase",
                      }}
                    >
                      {attentionReasonLabel(shift.attention_reason)}
                    </span>
                  </div>
                  <div
                    style={{
                      fontFamily: AC.font,
                      fontSize: 12.5,
                      color: "#6d4808",
                      lineHeight: 1.5,
                    }}
                  >
                    {rep ? displayName(rep) : "The assigned rep"} raised this{" "}
                    {relativeAgo(shift.attention_raised_at)}. Reassign, release
                    to the claimable pool, acknowledge it as handled offline,
                    or cancel the shift.
                  </div>
                  {shift.attention_note && (
                    <div
                      style={{
                        marginTop: 8,
                        padding: "8px 10px",
                        background: "#fff",
                        border: `1px solid ${AC.warn}55`,
                        borderRadius: 8,
                        fontFamily: AC.font,
                        fontSize: 12.5,
                        color: "#6d4808",
                        lineHeight: 1.45,
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      “{shift.attention_note}”
                    </div>
                  )}
                </div>
                <div style={{ padding: 12 }}>
                  {attPickerOpen ? (
                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        alignItems: "center",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Combobox
                          value={attPickedRepId}
                          onChange={(v) => setAttPickedRepId(v)}
                          triggerIcon="reps"
                          placeholder="Pick a rep…"
                          clearable={false}
                          searchable
                          options={reps
                            .filter((r) => r.id !== shift.rep_id)
                            .map((r) => {
                              const conflict = attConflictRepIds.has(r.id);
                              return {
                                value: r.id,
                                label: displayName(r),
                                sublabel: conflict
                                  ? `⚠ Conflict · already booked at this time`
                                  : r.email,
                                renderLeading: () => (
                                  <RepConflictAvatar rep={r} conflict={conflict} />
                                ),
                              };
                            })}
                        />
                        {attPickedHasConflict && (
                          <div
                            style={{
                              marginTop: 6,
                              padding: "6px 10px",
                              background: AC.dangerTint,
                              color: "#9c1a3c",
                              borderRadius: 8,
                              fontFamily: AC.font,
                              fontSize: 11.5,
                              fontWeight: 600,
                              lineHeight: 1.4,
                            }}
                          >
                            This rep already has an overlapping shift. You can
                            still reassign — you&apos;ll be asked to confirm
                            a double-book.
                          </div>
                        )}
                      </div>
                      <Btn
                        size="sm"
                        kind="primary"
                        icon="check"
                        disabled={attBusy || !attPickedRepId}
                        onClick={onAttReassign}
                      >
                        Reassign
                      </Btn>
                      <Btn
                        size="sm"
                        onClick={() => {
                          setAttPickerOpen(false);
                          setAttPickedRepId(null);
                        }}
                        disabled={attBusy}
                      >
                        Cancel
                      </Btn>
                    </div>
                  ) : (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <Btn
                        size="sm"
                        kind="primary"
                        icon="reps"
                        onClick={() => setAttPickerOpen(true)}
                        disabled={attBusy}
                      >
                        Reassign
                      </Btn>
                      <Btn
                        size="sm"
                        icon="send"
                        onClick={onAttRelease}
                        disabled={attBusy}
                      >
                        Release
                      </Btn>
                      <Btn
                        size="sm"
                        icon="check"
                        onClick={onAttAcknowledge}
                        disabled={attBusy}
                        title="Use only when you've spoken to the rep and they're still doing it. They'll see a confirmation on their phone."
                      >
                        Keep · rep stays on
                      </Btn>
                      <Btn
                        size="sm"
                        kind="danger"
                        icon="x"
                        onClick={onAttCancel}
                        disabled={attBusy}
                      >
                        Cancel shift
                      </Btn>
                      {/* Escape hatch — manager wants the full edit
                          form for date/time/customer/site/etc, not
                          one of the canned resolutions. Routes to the
                          shift edit page; whichever change they make
                          there doesn't auto-resolve the flag, so the
                          banner persists until they pick a resolution. */}
                      <Link
                        href={`/shifts/${shift.id}/edit`}
                        style={{ textDecoration: "none" }}
                      >
                        <Btn size="sm" icon="edit" disabled={attBusy}>
                          Edit shift…
                        </Btn>
                      </Link>
                    </div>
                  )}
                </div>
              </Card>
            )}

          {/* Header card */}
          <Card padding={20}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 12,
                  background: customer?.color || AC.brand,
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: AC.font,
                  fontSize: 18,
                  fontWeight: 700,
                  letterSpacing: 0.5,
                  flexShrink: 0,
                }}
              >
                {customer?.initials || "??"}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: AC.font,
                    fontSize: 18,
                    fontWeight: 700,
                    color: AC.ink,
                    letterSpacing: -0.2,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  {customer ? (
                    <a
                      href={`/customers/${customer.id}`}
                      style={{ color: AC.ink, textDecoration: "none" }}
                    >
                      {customerName}
                    </a>
                  ) : (
                    customerName
                  )}
                  <span
                    style={{
                      padding: "2px 8px",
                      borderRadius: 99,
                      background: tone.bg,
                      color: tone.fg,
                      fontFamily: AC.font,
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: 0.4,
                      textTransform: "uppercase",
                    }}
                  >
                    {STATE_LABEL[shift.state] || shift.state}
                  </span>
                </div>
                <div
                  style={{
                    fontFamily: AC.font,
                    fontSize: 12.5,
                    color: AC.mute,
                    marginTop: 4,
                  }}
                >
                  #{customer?.code ?? "—"} · {formatDate(shift.shift_date)} ·{" "}
                  {formatTimeRange(shift.start_time, shift.end_time)}
                </div>
                {/* Site row — only when the customer has a non-default
                    site name. Quiet for single-site customers. */}
                {shift.site && shift.site.name && shift.site.name !== "Head office" && (
                  <div
                    style={{
                      fontFamily: AC.font,
                      fontSize: 12.5,
                      color: AC.ink2,
                      marginTop: 6,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <AGlyph name="pin" size={12} color={AC.brand} />
                    {shift.site.name}
                    {shift.site.address && (
                      <span style={{ color: AC.mute }}>
                        · {shift.site.address}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div
              style={{
                marginTop: 18,
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 12,
              }}
            >
              <Stat
                label="Rep"
                value={
                  rep
                    ? displayName(rep)
                    : shift.rep_id
                    ? "—"
                    : "Unassigned (claimable)"
                }
                href={rep ? `/reps/${rep.id}` : undefined}
              />
              <Stat
                label="Tasks done"
                value={`${doneCount} of ${tasks.length}`}
                tone={
                  tasks.length === 0
                    ? "muted"
                    : doneCount === tasks.length
                    ? "ok"
                    : "warn"
                }
              />
              <Stat
                label="Compulsory done"
                value={`${compulsoryDone} of ${compulsory.length}`}
                tone={
                  compulsory.length === 0
                    ? "muted"
                    : compulsoryDone === compulsory.length
                    ? "ok"
                    : "warn"
                }
              />
            </div>

            {shift.distance_label && (
              <div
                style={{
                  marginTop: 12,
                  fontFamily: AC.font,
                  fontSize: 12,
                  color: AC.mute,
                }}
              >
                Distance label: <b style={{ color: AC.ink2 }}>{shift.distance_label}</b>
              </div>
            )}
          </Card>

          {/* Live card — only renders for in-progress / on-break
              shifts. Shows when the rep checked in, the current
              clock time, elapsed since check-in (live-ticking), and
              the task they're working on right now (polled every
              30 s). Disappears the moment the shift completes. */}
          {(shift.state === "in-progress" || shift.state === "on-break") && (
            <LiveActivityCard
              checkInAt={shift.check_in_at}
              now={now}
              activeTask={activeTask}
              onBreak={shift.state === "on-break"}
            />
          )}

          {/* Tasks card */}
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
              <span
                style={{
                  fontFamily: AC.font,
                  fontSize: 11.5,
                  color: AC.mute,
                }}
              >
                What the rep ticked off on this shift
              </span>
            </div>

            {tasks.length === 0 ? (
              <div
                style={{
                  padding: 28,
                  textAlign: "center",
                  fontFamily: AC.font,
                  fontSize: 13,
                  color: AC.mute,
                }}
              >
                No tasks defined for this customer.
                <div style={{ marginTop: 6, fontSize: 11.5 }}>
                  Define tasks under{" "}
                  <a
                    href={`/customers/${customer?.id}`}
                    style={{ color: AC.brandDeep, fontWeight: 600 }}
                  >
                    Customer → Tasks
                  </a>
                  .
                </div>
              </div>
            ) : (
              <div>
                {tasks.map((t, i) => {
                  const c = compByTaskId.get(t.id) || null;
                  return (
                    <TaskCompletionRow
                      key={t.id}
                      task={t}
                      completion={c}
                      isLast={i === tasks.length - 1}
                    />
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        {/* Right: custom fields + quick actions */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Rep notes — freeform context the rep added on /active.
              Read-only here; the rep owns the content. Only renders
              when there's actually something to show. */}
          {shift.rep_notes && shift.rep_notes.trim().length > 0 && (
            <Card padding={16}>
              <div
                style={{
                  fontFamily: AC.font,
                  fontSize: 11,
                  fontWeight: 700,
                  color: AC.mute,
                  letterSpacing: 0.4,
                  textTransform: "uppercase",
                  marginBottom: 8,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <AGlyph name="audit" size={12} color={AC.mute} />
                Notes from rep
              </div>
              <div
                style={{
                  fontFamily: AC.font,
                  fontSize: 13.5,
                  color: AC.ink,
                  lineHeight: 1.55,
                  whiteSpace: "pre-wrap",
                  padding: "8px 10px",
                  background: AC.bg,
                  borderRadius: 8,
                  border: `1px solid ${AC.lineDim}`,
                }}
              >
                {shift.rep_notes}
              </div>
            </Card>
          )}
          <CustomFieldsCard entity="shift" entityId={shift.id} />
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
              About this view
            </div>
            <div
              style={{
                fontFamily: AC.font,
                fontSize: 12.5,
                color: AC.ink2,
                lineHeight: 1.55,
              }}
            >
              Each task row shows whether the rep ticked it off during the
              shift, who did it, and when. Backed by the
              {" "}
              <code style={{ fontSize: 11.5, fontFamily: AC.fontMono }}>
                shift_task_completions
              </code>
              {" "}
              table — see <a href="/settings" style={{ color: AC.brandDeep, fontWeight: 600 }}>
                Settings → Custom fields
              </a> to attach additional metadata.
            </div>
          </Card>
        </div>
      </div>
    </AdminShell>
  );
}

function Stat({
  label,
  value,
  href,
  tone = "default",
}: {
  label: string;
  value: string;
  href?: string;
  tone?: "default" | "ok" | "warn" | "muted";
}) {
  const fg =
    tone === "ok"
      ? "#1f7a3f"
      : tone === "warn"
      ? AC.warn
      : tone === "muted"
      ? AC.mute
      : AC.ink;
  const inner = (
    <>
      <div
        style={{
          fontFamily: AC.font,
          fontSize: 11,
          fontWeight: 700,
          color: AC.mute,
          letterSpacing: 0.3,
          textTransform: "uppercase",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: AC.font,
          fontSize: 14,
          fontWeight: 600,
          color: fg,
          letterSpacing: -0.1,
        }}
      >
        {value}
      </div>
    </>
  );
  return href ? (
    <a
      href={href}
      style={{
        display: "block",
        padding: "10px 12px",
        background: AC.bg,
        borderRadius: 10,
        textDecoration: "none",
      }}
    >
      {inner}
    </a>
  ) : (
    <div
      style={{
        padding: "10px 12px",
        background: AC.bg,
        borderRadius: 10,
      }}
    >
      {inner}
    </div>
  );
}

function TaskCompletionRow({
  task,
  completion,
  isLast,
}: {
  task: TaskRow;
  completion: ShiftTaskCompletion | null;
  isLast: boolean;
}) {
  const done = completion !== null;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        padding: "12px 16px",
        borderBottom: isLast ? "none" : `1px solid ${AC.lineDim}`,
        background: "#fff",
      }}
    >
      <div
        style={{
          width: 22,
          height: 22,
          borderRadius: 99,
          background: done ? "#dcf6e3" : AC.bg,
          color: done ? "#1f7a3f" : AC.mute,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          marginTop: 1,
        }}
      >
        <AGlyph name={done ? "check" : "dot"} size={12} color={done ? "#1f7a3f" : AC.mute} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: AC.font,
            fontSize: 13,
            fontWeight: 600,
            color: AC.ink,
            letterSpacing: -0.1,
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          {task.name}
          {task.compulsory && (
            <span
              style={{
                padding: "1px 6px",
                borderRadius: 99,
                background: AC.dangerTint,
                color: "#9c1a3c",
                fontFamily: AC.font,
                fontSize: 9.5,
                fontWeight: 700,
                letterSpacing: 0.4,
                textTransform: "uppercase",
              }}
            >
              Compulsory
            </span>
          )}
        </div>
        {task.description && (
          <div
            style={{
              fontFamily: AC.font,
              fontSize: 12,
              color: AC.mute,
              marginTop: 3,
              lineHeight: 1.45,
            }}
          >
            {task.description}
          </div>
        )}
        <div
          style={{
            marginTop: 4,
            fontFamily: AC.font,
            fontSize: 11.5,
            color: done ? "#1f7a3f" : AC.hint,
            fontWeight: 500,
          }}
        >
          {done ? (
            <>
              Done{completion?.repName ? ` by ${completion.repName}` : ""}
              {" · "}
              {formatCompletedAt(completion!.completedAt)}
            </>
          ) : (
            <>Not yet completed</>
          )}
        </div>
      </div>
      <div
        style={{
          fontFamily: AC.fontMono,
          fontSize: 11,
          color: AC.mute,
          flexShrink: 0,
          marginTop: 2,
        }}
      >
        ~{task.duration_min}m
      </div>
    </div>
  );
}

/**
 * LiveActivityCard — live readout for in-progress / on-break shifts.
 * Shows when the rep checked in, the current clock time, elapsed
 * since check-in, and whatever task they're working on RIGHT NOW
 * (polled every 30 s by the parent). Brand-tinted with a pulsing
 * dot so a manager glancing at the page instantly knows the shift
 * is live.
 */
function LiveActivityCard({
  checkInAt,
  now,
  activeTask,
  onBreak,
}: {
  checkInAt: string | null;
  now: number;
  activeTask: ActiveTask | null;
  onBreak: boolean;
}) {
  const checkInMs = checkInAt ? new Date(checkInAt).getTime() : null;
  const elapsedMs =
    checkInMs && Number.isFinite(checkInMs) ? Math.max(0, now - checkInMs) : null;
  const elapsedLabel = formatElapsed(elapsedMs);
  const checkInLabel = checkInMs
    ? new Date(checkInMs).toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      })
    : "—";
  const nowLabel = new Date(now).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
  const taskStartedMs = activeTask
    ? new Date(activeTask.startedAt).getTime()
    : null;
  const taskElapsedLabel =
    taskStartedMs && Number.isFinite(taskStartedMs)
      ? formatElapsed(now - taskStartedMs)
      : null;
  const tone = onBreak ? "#5b3da5" : AC.brand;
  const toneTint = onBreak ? "#EDE7F8" : AC.brandTint;
  const toneDeep = onBreak ? "#3d2570" : AC.brandDeep;

  return (
    <Card padding={0}>
      <div
        style={{
          padding: "12px 16px",
          background: toneTint,
          borderTopLeftRadius: 14,
          borderTopRightRadius: 14,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span
          style={{
            display: "inline-block",
            width: 10,
            height: 10,
            borderRadius: 99,
            background: tone,
            boxShadow: `0 0 0 4px ${tone}44`,
            animation: "live-pulse 1.4s ease-out infinite",
          }}
        />
        <div
          style={{
            fontFamily: AC.font,
            fontSize: 11,
            fontWeight: 700,
            color: toneDeep,
            letterSpacing: 0.5,
            textTransform: "uppercase",
          }}
        >
          {onBreak ? "On break" : "Live"}
        </div>
        <div style={{ flex: 1 }} />
        <div
          style={{
            fontFamily: AC.fontMono,
            fontSize: 12,
            color: toneDeep,
            fontWeight: 600,
          }}
        >
          {nowLabel}
        </div>
      </div>
      <div style={{ padding: 16, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
        <Stat label="Checked in" value={checkInLabel} />
        <Stat label="Elapsed" value={elapsedLabel || "—"} />
        <Stat
          label={activeTask ? "Working on" : "Activity"}
          value={
            onBreak
              ? "On break"
              : activeTask?.taskName ||
                (activeTask ? "(task name missing)" : "Between tasks")
          }
        />
      </div>
      {activeTask && taskElapsedLabel && (
        <div
          style={{
            padding: "0 16px 14px",
            fontFamily: AC.font,
            fontSize: 12,
            color: AC.mute,
            lineHeight: 1.4,
          }}
        >
          Started {taskElapsedLabel} ago.
        </div>
      )}
      <style>{`
        @keyframes live-pulse {
          0%   { box-shadow: 0 0 0 0   ${tone}55; }
          70%  { box-shadow: 0 0 0 10px ${tone}00; }
          100% { box-shadow: 0 0 0 0   ${tone}00; }
        }
      `}</style>
    </Card>
  );
}

/** "1h 23m" / "12m" / "47s" — pick the chunkiest unit that's sane. */
function formatElapsed(ms: number | null): string | null {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return null;
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins === 0 ? `${hrs}h` : `${hrs}h ${remMins}m`;
}
