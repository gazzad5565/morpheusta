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
import { AdminShell } from "@/components/shell/AdminShell";
import { Btn } from "@/components/ui/Btn";
import { Card, SectionTitle } from "@/components/ui/Card";
import { AGlyph } from "@/components/ui/AGlyph";
import { CustomFieldsCard } from "@/components/ui/CustomFieldsCard";
import { AC } from "@/lib/tokens";
import { getShiftById, type ShiftRow } from "@/lib/shifts-store";
import { listTasksForCustomer, type TaskRow } from "@/lib/tasks-store";
import { getProfileById, type Profile, displayName } from "@/lib/profiles-store";
import {
  listCompletionsForShift,
  type ShiftTaskCompletion,
} from "@/lib/task-completions-store";

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const s = await getShiftById(id);
      if (cancelled) return;
      if (!s) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setShift(s);
      const [taskRows, comps, repProfile] = await Promise.all([
        listTasksForCustomer(s.customer_id),
        listCompletionsForShift(s.id),
        s.rep_id ? getProfileById(s.rep_id) : Promise.resolve(null),
      ]);
      if (cancelled) return;
      setTasks(taskRows);
      setCompletions(comps);
      setRep(repProfile);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

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

  return (
    <AdminShell
      breadcrumbs={["Home", "Shifts", `${customerName} · ${formatDate(shift.shift_date)}`]}
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
