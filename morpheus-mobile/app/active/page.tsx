"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { MC } from "@/lib/tokens";
import { type Task } from "@/lib/mock-data";
import {
  AppHeader,
  AppFooter,
  CustomerTile,
  SectionLabel,
} from "@/components/Chrome";
import { Glyph, formatTime, type GlyphName } from "@/components/Glyph";
import { startLocationTracking } from "@/lib/location-tracker";
import {
  getMyActiveShift,
  getTasksForCustomer,
  type TaskRow,
} from "@/lib/shifts-store";
import {
  listCompletedTaskIds,
  markTaskComplete,
} from "@/lib/task-completions-store";

interface ShiftData {
  name: string;
  initials: string;
  color: string;
  code: number;
  distance: string;
  checkInAt: string | null;
  customerId: string;
  /** The real `shifts.id` UUID — used for persisting task completions. */
  shiftId: string;
}

export default function ActiveShiftPage() {
  const router = useRouter();

  const [shiftData, setShiftData] = useState<ShiftData | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadedShift, setLoadedShift] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const s = await getMyActiveShift();
      if (cancelled) return;
      if (!s) {
        setLoadedShift(true);
        return;
      }
      setShiftData({
        name: s.name,
        initials: s.initials,
        color: s.color,
        code: s.code,
        distance: s.distance,
        checkInAt: s.checkInAt,
        customerId: s.id,
        shiftId: s.realId,
      });
      setLoadedShift(true);
      const [rows, alreadyDone] = await Promise.all([
        getTasksForCustomer(s.id),
        listCompletedTaskIds(s.realId),
      ]);
      if (cancelled) return;
      setTasks(
        rows.map((r: TaskRow): Task => ({
          id: r.id,
          name: r.name,
          duration: r.duration_min,
          compulsory: r.compulsory,
          description: r.description ?? "",
        }))
      );
      // Hydrate completed-state from the DB so closing/reopening the
      // app mid-shift doesn't lose the rep's ticks.
      if (alreadyDone.length > 0) setCompletedTaskIds(alreadyDone);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const shift = shiftData;
  // Anchor the timer to the real check-in time when we have it. While the
  // fetch is in flight (or there's no active shift) fall back to "5 min
  // ago" so the timer renders something sensible.
  const shiftStartTs = useMemo(() => {
    if (shiftData?.checkInAt) {
      const t = new Date(shiftData.checkInAt).getTime();
      if (!Number.isNaN(t)) return t;
    }
    return Date.now() - 5 * 60 * 1000;
  }, [shiftData?.checkInAt]);

  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [activeTaskStartedAt, setActiveTaskStartedAt] = useState<number | null>(null);
  const [completedTaskIds, setCompletedTaskIds] = useState<string[]>([]);
  const [openSheet, setOpenSheet] = useState<{ task: Task } | null>(null);

  const [tasksOpen, setTasksOpen] = useState(true);
  const [availOpen, setAvailOpen] = useState(false);
  const [breaksOpen, setBreaksOpen] = useState(false);

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Live-track this rep's location for the admin map while the shift is active.
  useEffect(() => {
    const tracker = startLocationTracking();
    return () => tracker.stop();
  }, []);

  const elapsed = Math.max(0, Math.floor((now - shiftStartTs) / 1000));
  const hh = String(Math.floor(elapsed / 3600)).padStart(2, "0");
  const mm = String(Math.floor((elapsed % 3600) / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  // Standard break options. Not a DB feature (yet) — these are timer-only
  // so the rep can pause inside an active shift. Tap any → opens the
  // sheet → Start break → timer runs → End break.
  const breaks: Task[] = [
    {
      id: "break-15",
      name: "Short break",
      compulsory: false,
      duration: 15,
      description: "A quick 15-minute break.",
      kind: "break",
    },
    {
      id: "break-30",
      name: "Lunch break",
      compulsory: false,
      duration: 30,
      description: "A 30-minute lunch break.",
      kind: "break",
    },
    {
      id: "break-60",
      name: "Long break",
      compulsory: false,
      duration: 60,
      description: "An hour-long break.",
      kind: "break",
    },
  ];
  const compulsory = tasks.filter((t) => t.compulsory);
  const available = tasks.filter((t) => !t.compulsory);
  const compulsoryDone = compulsory.every((t) => completedTaskIds.includes(t.id));
  const completeCount = completedTaskIds.length;
  const totalCount = tasks.length;

  // No active shift → guide the rep back to /shifts. Shows while the fetch
  // is in flight too, so we don't briefly render placeholder customer info.
  if (!shift) {
    return (
      <div style={{ background: MC.bg, minHeight: "100%" }}>
        <AppHeader title="Shift Dashboard" onBack={() => router.push("/")} />
        <div style={{ padding: "32px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div
            style={{
              background: MC.card,
              border: `1px dashed ${MC.line}`,
              borderRadius: MC.radiusCard,
              padding: 28,
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontFamily: MC.fontDisplay,
                fontSize: 18,
                fontWeight: 700,
                color: MC.ink,
                letterSpacing: -0.3,
              }}
            >
              {loadedShift ? "No active shift" : "Loading…"}
            </div>
            {loadedShift && (
              <div
                style={{
                  fontFamily: MC.font,
                  fontSize: 13,
                  color: MC.mute,
                  marginTop: 8,
                  lineHeight: 1.5,
                }}
              >
                Check in to a shift first. Open <b>Today&apos;s shifts</b> and tap one to begin.
              </div>
            )}
          </div>
          {loadedShift && (
            <button
              type="button"
              onClick={() => router.push("/shifts")}
              style={{
                marginTop: 6,
                padding: "12px 16px",
                borderRadius: 12,
                border: "none",
                background: MC.brand,
                color: "#fff",
                fontFamily: MC.font,
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                boxShadow: `0 6px 18px ${MC.brand}55`,
              }}
            >
              Go to Today&apos;s shifts
            </button>
          )}
        </div>
        <AppFooter />
      </div>
    );
  }

  const startTask = () => {
    if (!openSheet) return;
    setActiveTaskId(openSheet.task.id);
    setActiveTaskStartedAt(Date.now());
    setOpenSheet(null);
  };

  const completeTask = () => {
    if (!openSheet) return;
    const taskId = openSheet.task.id;
    setActiveTaskId(null);
    setActiveTaskStartedAt(null);
    setCompletedTaskIds((ids) => (ids.includes(taskId) ? ids : [...ids, taskId]));
    setOpenSheet(null);
    // Persist to DB so the manager can see what was done on this shift.
    // Fire-and-forget; if it fails the local UI still reflects the tick
    // and we'd rather leave that than block the rep on a flaky network.
    if (shiftData?.shiftId) {
      void markTaskComplete(shiftData.shiftId, taskId).then((r) => {
        if (!r.ok) {
          // eslint-disable-next-line no-console
          console.warn("[active] markTaskComplete failed:", r.error);
        }
      });
    }
  };

  const sheetMode = openSheet
    ? completedTaskIds.includes(openSheet.task.id)
      ? "done"
      : activeTaskId === openSheet.task.id
      ? "active"
      : "idle"
    : "idle";
  const sheetElapsed =
    openSheet && activeTaskId === openSheet.task.id && activeTaskStartedAt
      ? Math.floor((now - activeTaskStartedAt) / 1000)
      : null;

  return (
    <div style={{ background: MC.bg, minHeight: "100%", position: "relative" }}>
      <AppHeader title="Shift Dashboard" />

      <div style={{ padding: "20px 16px 0" }}>
        <div
          style={{
            background: MC.card,
            borderRadius: MC.radiusCard,
            border: `1px solid ${MC.line}`,
            padding: 16,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div
              style={{
                fontFamily: MC.font,
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: 1,
                textTransform: "uppercase",
                color: MC.hint,
              }}
            >
              Checked into
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <Glyph name="target" size={16} color={MC.brand} />
            </div>
          </div>
          <div
            style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10 }}
          >
            <CustomerTile initials={shift.initials} color={shift.color} size={48} />
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontFamily: MC.fontDisplay,
                  fontSize: 22,
                  fontWeight: 700,
                  color: MC.ink,
                  letterSpacing: -0.5,
                  lineHeight: 1.1,
                }}
              >
                {shift.name}
              </div>
              <div
                style={{
                  fontFamily: MC.font,
                  fontSize: 12.5,
                  color: MC.mute,
                  marginTop: 2,
                }}
              >
                Code {shift.code} · {shift.distance}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: "12px 16px 0" }}>
        <div
          style={{
            background: MC.ink,
            borderRadius: MC.radiusCard,
            padding: 16,
            color: "#fff",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 0,
              bottom: 0,
              height: 3,
              width: `${totalCount ? (completeCount / totalCount) * 100 : 0}%`,
              background: MC.brand,
              transition: "width .3s ease",
            }}
          />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div
                style={{
                  fontFamily: MC.font,
                  fontSize: 10.5,
                  fontWeight: 600,
                  letterSpacing: 1,
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,.5)",
                }}
              >
                Shift time
              </div>
              <div
                style={{
                  fontFamily: MC.fontDisplay,
                  fontSize: 32,
                  fontWeight: 700,
                  letterSpacing: -1,
                  marginTop: 2,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {hh}:{mm}
                <span style={{ color: "rgba(255,255,255,.5)", fontSize: 22 }}>
                  :{ss}
                </span>
              </div>
              <div
                style={{
                  fontFamily: MC.font,
                  fontSize: 12,
                  color: "rgba(255,255,255,.6)",
                  marginTop: 2,
                }}
              >
                Started {formatTime(shiftStartTs)}
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                const qs = completedTaskIds.length
                  ? `?completed=${completedTaskIds.join(",")}`
                  : "";
                router.push(`/check-out${qs}`);
              }}
              style={{
                background: MC.brand,
                color: "#fff",
                border: "none",
                padding: "12px 16px",
                borderRadius: 12,
                cursor: "pointer",
                fontFamily: MC.font,
                fontSize: 14,
                fontWeight: 600,
                letterSpacing: -0.1,
                display: "flex",
                alignItems: "center",
                gap: 6,
                boxShadow: `0 6px 18px ${MC.brand}55`,
              }}
            >
              Check out
              <Glyph name="leave" size={16} color="#fff" />
            </button>
          </div>
          <div
            style={{
              marginTop: 10,
              fontFamily: MC.font,
              fontSize: 11.5,
              color: "rgba(255,255,255,.7)",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Glyph
              name="check-circle"
              size={13}
              color={compulsoryDone ? MC.brand : "rgba(255,255,255,.7)"}
            />
            <span>
              {completeCount}/{totalCount} complete
            </span>
            <span style={{ opacity: 0.5 }}>·</span>
            <span style={{ color: compulsoryDone ? MC.brand : "#FFB1C2" }}>
              {compulsoryDone
                ? "Ready to check out"
                : `${compulsory.filter((t) => !completedTaskIds.includes(t.id)).length} compulsory left`}
            </span>
          </div>
        </div>
      </div>

      <SectionLabel>Complete before check-out</SectionLabel>
      <div style={{ padding: "0 16px" }}>
        <ExpandRow
          icon="note"
          iconBg={MC.dangerTint}
          iconColor="#9c1a3c"
          label="Tasks"
          badge={compulsory.length}
          badgeTone="danger"
          open={tasksOpen}
          onToggle={() => setTasksOpen((o) => !o)}
        />
        {tasksOpen && (
          <div style={{ padding: "4px 0 12px" }}>
            {compulsory.length === 0 ? (
              <div
                style={{
                  padding: "12px 14px",
                  background: MC.card,
                  border: `1px dashed ${MC.line}`,
                  borderRadius: 12,
                  fontFamily: MC.font,
                  fontSize: 12.5,
                  color: MC.mute,
                  textAlign: "center",
                }}
              >
                No compulsory tasks for this customer yet.
              </div>
            ) : (
              compulsory.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  completed={completedTaskIds.includes(t.id)}
                  active={activeTaskId === t.id}
                  onClick={() => setOpenSheet({ task: t })}
                />
              ))
            )}
          </div>
        )}
      </div>

      <SectionLabel>Available tasks</SectionLabel>
      <div style={{ padding: "0 16px" }}>
        <ExpandRow
          icon="note"
          iconBg={MC.brandTint}
          iconColor={MC.brandDeep}
          label="Optional tasks"
          badge={available.length}
          badgeTone="brand"
          open={availOpen}
          onToggle={() => setAvailOpen((o) => !o)}
        />
        {availOpen && (
          <div style={{ padding: "4px 0 12px" }}>
            {available.length === 0 ? (
              <div
                style={{
                  padding: "12px 14px",
                  background: MC.card,
                  border: `1px dashed ${MC.line}`,
                  borderRadius: 12,
                  fontFamily: MC.font,
                  fontSize: 12.5,
                  color: MC.mute,
                  textAlign: "center",
                }}
              >
                No optional tasks for this customer yet.
              </div>
            ) : (
              available.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  completed={completedTaskIds.includes(t.id)}
                  active={activeTaskId === t.id}
                  onClick={() => setOpenSheet({ task: t })}
                />
              ))
            )}
          </div>
        )}
      </div>

      <SectionLabel>Breaks</SectionLabel>
      <div style={{ padding: "0 16px 18px" }}>
        <ExpandRow
          icon="clock"
          iconBg="#EDE7F8"
          iconColor="#5b3da5"
          label="Breaks"
          badge={breaks.length}
          badgeTone="neutral"
          open={breaksOpen}
          onToggle={() => setBreaksOpen((o) => !o)}
        />
        {breaksOpen && (
          <div style={{ padding: "4px 0 8px" }}>
            {breaks.map((b) => (
              <BreakRow
                key={b.id}
                breakItem={b}
                onClick={() => setOpenSheet({ task: { ...b, kind: "break" } })}
              />
            ))}
          </div>
        )}
      </div>

      <AppFooter />

      {openSheet && (
        <TaskSheet
          task={openSheet.task}
          mode={sheetMode}
          elapsedSec={sheetElapsed}
          onStart={startTask}
          onComplete={completeTask}
          onClose={() => setOpenSheet(null)}
        />
      )}
    </div>
  );
}

function ExpandRow({
  icon,
  iconBg,
  iconColor,
  label,
  badge,
  badgeTone = "neutral",
  open,
  onToggle,
}: {
  icon: GlyphName;
  iconBg: string;
  iconColor: string;
  label: string;
  badge: number;
  badgeTone?: "danger" | "brand" | "neutral";
  open: boolean;
  onToggle: () => void;
}) {
  const tones = {
    danger: { bg: MC.dangerTint, fg: "#9c1a3c" },
    brand: { bg: MC.brandTint, fg: MC.brandDeep },
    neutral: { bg: "#E8EAEE", fg: MC.mute },
  };
  const t = tones[badgeTone];
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        width: "100%",
        background: MC.card,
        border: `1px solid ${MC.line}`,
        borderRadius: 14,
        padding: "12px 14px",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 12,
        textAlign: "left",
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: iconBg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Glyph name={icon} size={18} color={iconColor} />
      </div>
      <div
        style={{
          flex: 1,
          fontFamily: MC.font,
          fontSize: 15,
          fontWeight: 600,
          color: MC.ink,
          letterSpacing: -0.1,
        }}
      >
        {label}
      </div>
      <span
        style={{
          background: t.bg,
          color: t.fg,
          borderRadius: 999,
          padding: "2px 9px",
          fontSize: 11.5,
          fontWeight: 700,
          fontFamily: MC.font,
          minWidth: 22,
          textAlign: "center",
        }}
      >
        {badge}
      </span>
      <Glyph name={open ? "chev-u" : "chev-d"} size={18} color={MC.hint} />
    </button>
  );
}

function TaskRow({
  task,
  completed,
  active,
  onClick,
}: {
  task: Task;
  completed: boolean;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: "100%",
        background: MC.card,
        border: `1px solid ${active ? MC.brand : MC.line}`,
        borderRadius: 12,
        padding: "12px 14px",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 12,
        textAlign: "left",
        marginTop: 6,
        boxShadow: active ? `0 0 0 3px ${MC.brand}22` : "none",
      }}
    >
      <div
        style={{
          width: 22,
          height: 22,
          borderRadius: 6,
          border: `1.5px solid ${completed ? MC.ok : MC.line}`,
          background: completed ? MC.ok : "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {completed && <Glyph name="check" size={14} color="#fff" strokeWidth={2.6} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: MC.font,
            fontSize: 14,
            fontWeight: 600,
            color: completed ? MC.mute : MC.ink,
            letterSpacing: -0.1,
            textDecoration: completed ? "line-through" : "none",
          }}
        >
          {task.name}
        </div>
        {task.duration != null && (
          <div
            style={{
              fontFamily: MC.font,
              fontSize: 12,
              color: MC.hint,
              marginTop: 2,
            }}
          >
            ~{task.duration} min{active ? " · in progress" : ""}
          </div>
        )}
      </div>
      {active && !completed && (
        <span
          style={{
            background: MC.brand,
            color: "#fff",
            borderRadius: 999,
            padding: "3px 10px",
            fontFamily: MC.font,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 0.4,
            textTransform: "uppercase",
          }}
        >
          Live
        </span>
      )}
    </button>
  );
}

function BreakRow({ breakItem, onClick }: { breakItem: Task; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: "100%",
        background: MC.card,
        border: `1px solid ${MC.line}`,
        borderRadius: 12,
        padding: "12px 14px",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 12,
        textAlign: "left",
        marginTop: 6,
      }}
    >
      <div
        style={{
          width: 22,
          height: 22,
          borderRadius: 6,
          border: `1.5px solid ${MC.line}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Glyph name="clock" size={14} color={MC.mute} />
      </div>
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontFamily: MC.font,
            fontSize: 14,
            fontWeight: 600,
            color: MC.ink,
          }}
        >
          {breakItem.name}
        </div>
      </div>
      <Glyph name="chev-r" size={16} color={MC.hint} />
    </button>
  );
}

function TaskSheet({
  task,
  mode,
  onStart,
  onComplete,
  onClose,
  elapsedSec,
}: {
  task: Task;
  mode: "idle" | "active" | "done";
  onStart: () => void;
  onComplete: () => void;
  onClose: () => void;
  elapsedSec: number | null;
}) {
  const isBreak = task.kind === "break";
  const accent = isBreak ? "#5b3da5" : MC.brand;

  return (
    <div
      role="dialog"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        background: "rgba(10,15,30,.45)",
        display: "flex",
        alignItems: "flex-end",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: MC.card,
          width: "100%",
          maxWidth: 440,
          margin: "0 auto",
          borderRadius: "20px 20px 0 0",
          overflow: "hidden",
          boxShadow: "0 -10px 30px rgba(0,0,0,.2)",
          animation: "mc-slideup .25s ease",
          maxHeight: "85%",
          overflowY: "auto",
        }}
      >
        <div
          style={{
            background: `linear-gradient(135deg, ${accent} 0%, ${accent}DD 100%)`,
            padding: "24px 20px 28px",
            position: "relative",
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 18,
              margin: "0 auto",
              background: "rgba(255,255,255,.18)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backdropFilter: "blur(8px)",
            }}
          >
            <Glyph
              name={isBreak ? "clock" : "note"}
              size={30}
              color="#fff"
              strokeWidth={1.8}
            />
          </div>
        </div>

        <div style={{ padding: "22px 20px 18px" }}>
          <div
            style={{
              fontFamily: MC.font,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: 1,
              textTransform: "uppercase",
              color: MC.hint,
              textAlign: "center",
            }}
          >
            {isBreak ? "Break" : task.compulsory ? "Compulsory task" : "Optional task"}
          </div>
          <div
            style={{
              fontFamily: MC.fontDisplay,
              fontSize: 22,
              fontWeight: 700,
              color: MC.ink,
              letterSpacing: -0.4,
              textAlign: "center",
              marginTop: 4,
            }}
          >
            {task.name}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: mode === "active" ? "1fr 1fr" : "1fr",
              gap: 10,
              marginTop: 16,
            }}
          >
            {mode === "active" && (
              <SheetStat
                label="Elapsed"
                value={formatElapsed(elapsedSec)}
                accent={accent}
              />
            )}
            <SheetStat
              label={mode === "active" ? "Started" : "Estimated"}
              value={`${task.duration || 0} min`}
              accent={MC.ink}
            />
          </div>

          {task.description && (
            <div
              style={{
                marginTop: 14,
                padding: 12,
                background: MC.bg,
                borderRadius: 12,
                fontFamily: MC.font,
                fontSize: 13,
                color: MC.ink2,
                lineHeight: 1.5,
              }}
            >
              {task.description}
            </div>
          )}

          <div style={{ marginTop: 18 }}>
            {mode === "idle" && (
              <button
                type="button"
                onClick={onStart}
                style={{
                  width: "100%",
                  height: 54,
                  borderRadius: 14,
                  border: "none",
                  background: MC.brand,
                  color: "#fff",
                  fontFamily: MC.font,
                  fontSize: 16,
                  fontWeight: 600,
                  cursor: "pointer",
                  boxShadow: `0 10px 24px ${MC.brand}55`,
                }}
              >
                {isBreak ? "Start break" : "Start task"}
              </button>
            )}
            {mode === "active" && (
              <button
                type="button"
                onClick={onComplete}
                style={{
                  width: "100%",
                  height: 54,
                  borderRadius: 14,
                  border: "none",
                  background: MC.brand,
                  color: "#fff",
                  fontFamily: MC.font,
                  fontSize: 16,
                  fontWeight: 600,
                  cursor: "pointer",
                  boxShadow: `0 10px 24px ${MC.brand}55`,
                }}
              >
                {isBreak ? "End break" : "Complete task"}
              </button>
            )}
            {mode === "done" && (
              <div
                style={{
                  padding: "14px 16px",
                  background: MC.okTint,
                  borderRadius: 12,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  fontFamily: MC.font,
                  fontSize: 14,
                  color: "#0d6a45",
                  fontWeight: 600,
                }}
              >
                <Glyph name="check-circle" size={20} color={MC.ok} />
                Completed
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SheetStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div
      style={{
        background: MC.bg,
        borderRadius: 12,
        padding: "10px 12px",
      }}
    >
      <div
        style={{
          fontFamily: MC.font,
          fontSize: 10.5,
          fontWeight: 600,
          letterSpacing: 0.8,
          textTransform: "uppercase",
          color: MC.hint,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: MC.fontDisplay,
          fontSize: 20,
          fontWeight: 700,
          color: accent,
          letterSpacing: -0.4,
          marginTop: 2,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function formatElapsed(sec: number | null) {
  if (sec == null) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
