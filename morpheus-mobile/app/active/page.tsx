"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { LoadingBar, Spinner } from "@/components/Loading";
import { CheckingInOverlay } from "@/components/CheckingInOverlay";
import { startLocationTracking } from "@/lib/location-tracker";
import { requestGeolocationOnce } from "@/lib/route-planner";
import {
  setCustomerSiteCoords,
  geocodeAddress,
} from "@/lib/customers-store";
import {
  uploadShiftTaskPhoto,
  listShiftTaskPhotos,
  deleteShiftTaskPhoto,
  subscribeShiftTaskPhotos,
  type UploadedPhoto,
} from "@/lib/photo-store";
import {
  getMyActiveShift,
  getTasksForCustomer,
  setShiftBreakState,
  saveShiftNotes,
  subscribeShifts,
  type TaskRow,
} from "@/lib/shifts-store";
import {
  listCompletedTaskIds,
  markTaskComplete,
} from "@/lib/task-completions-store";
import { logEvent } from "@/lib/events-store";
import { drainEventQueue } from "@/lib/event-queue";

/** localStorage key for the in-flight task on /active. Survives app close. */
const ACTIVE_TASK_LS_KEY = "morpheus.active_task";

interface ShiftData {
  name: string;
  initials: string;
  color: string;
  code: number;
  /** Customer logo (base64 data URL), when uploaded by admin. Lets
   *  the active-shift hero swap the coloured-initials tile for the
   *  customer's branding. */
  logoUrl: string | null;
  distance: string;
  checkInAt: string | null;
  customerId: string;
  /** The real `shifts.id` UUID — used for persisting task completions. */
  shiftId: string;
  /** Site name for the shift, when the customer has more than the
   *  auto-created "Head office" site. Null otherwise so the UI can
   *  hide the pin row entirely for single-site customers. */
  siteName: string | null;
  /** Per-site contact details. Reps tap the phone to call ahead, the
   *  email to send a quick "running 10 min late" note, and read the
   *  access notes block while travelling for parking / buzzer info. */
  siteContactName: string | null;
  siteContactPhone: string | null;
  siteContactEmail: string | null;
  siteNotes: string | null;
  /** Rep's own free-text notes on this shift, edited from /active.
   *  Persists to shifts.rep_notes; admin sees it read-only. */
  repNotes: string | null;
  /** Site identifier — used to write coords back when the rep
   *  completes the geocode-task card. */
  siteId: string | null;
  /** Site address as a string — fed into the "Geocode address"
   *  button on the geocode-task card. */
  siteAddress: string | null;
  /** Site lat/lng. When either is null the geocode-task card
   *  surfaces at the top of the task list (Feature B — May 13).
   *  Set non-null by either the admin's manual edit, the create-
   *  customer geocode-on-save path, or this card's "Use my
   *  current location" / "Geocode address" actions. */
  siteLat: number | null;
  siteLng: number | null;
}

export default function ActiveShiftPage() {
  const router = useRouter();

  const [shiftData, setShiftData] = useState<ShiftData | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadedShift, setLoadedShift] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const s = await getMyActiveShift();
      if (cancelled) return;
      if (!s) {
        // Shift no longer in-progress / no longer mine — could mean
        // the manager deleted or reassigned it while the rep was on
        // this screen. Clear UI; the empty-state below redirects them
        // to /shifts.
        setShiftData(null);
        setLoadedShift(true);
        return;
      }
      setShiftData({
        name: s.name,
        initials: s.initials,
        color: s.color,
        code: s.code,
        logoUrl: s.logoUrl ?? null,
        distance: s.distance,
        checkInAt: s.checkInAt,
        customerId: s.id,
        shiftId: s.realId,
        siteName: s.siteName,
        siteContactName: s.siteContactName,
        siteContactPhone: s.siteContactPhone,
        siteContactEmail: s.siteContactEmail,
        siteNotes: s.siteNotes,
        repNotes: s.repNotes,
        // New (May 13) — surface site identifier + coords to drive
        // the geocode-task card below.
        siteId: s.siteId ?? null,
        siteAddress: s.siteAddress ?? null,
        siteLat: s.siteLat ?? null,
        siteLng: s.siteLng ?? null,
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
          photoCount: r.photo_count ?? 0,
          photosCompulsory: r.photos_compulsory ?? true,
        }))
      );
      // Hydrate completed-state from the DB so closing/reopening the
      // app mid-shift doesn't lose the rep's ticks.
      if (alreadyDone.length > 0) setCompletedTaskIds(alreadyDone);
    };
    load();
    // Realtime: re-resolve the active shift on any shifts-table change.
    // Covers manager-deleted, manager-reassigned, auto-checkout sweep —
    // anything that flips the rep out of an in-progress state.
    const unsub = subscribeShifts(load);
    // Drain any events that failed during the last session — typically
    // the screen sleeping mid-request. Best-effort; never blocks UI.
    void drainEventQueue();
    // Mobile browsers aggressively suspend websockets when the screen
    // sleeps, so realtime alone isn't enough — when the page comes
    // back to the foreground we need to manually re-sync AND retry
    // any queued events that failed mid-request while backgrounded.
    const onVis = () => {
      if (document.visibilityState === "visible") {
        load();
        void drainEventQueue();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
      unsub();
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

  // Persist the in-flight task across screen sleep / app close. The
  // rep starts a task → puts the phone in their pocket → does the
  // physical work → unlocks → taps Complete. If the browser discarded
  // the tab in between (which iOS Safari aggressively does), local
  // state is gone unless we mirror it to localStorage.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(ACTIVE_TASK_LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { id: string; startedAt: number } | null;
        if (parsed && parsed.id && Number.isFinite(parsed.startedAt)) {
          setActiveTaskId(parsed.id);
          setActiveTaskStartedAt(parsed.startedAt);
        }
      }
    } catch {
      /* SSR / blocked storage */
    }
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (activeTaskId && activeTaskStartedAt) {
        window.localStorage.setItem(
          ACTIVE_TASK_LS_KEY,
          JSON.stringify({ id: activeTaskId, startedAt: activeTaskStartedAt })
        );
      } else {
        window.localStorage.removeItem(ACTIVE_TASK_LS_KEY);
      }
    } catch {
      /* noop */
    }
  }, [activeTaskId, activeTaskStartedAt]);

  // Accordion default rules (May 12 — Gary):
  //   - If there are NO tasks at all → both accordions closed (no
  //     point pre-expanding an empty list).
  //   - If there ARE compulsory tasks → the compulsory section is
  //     open by default so the rep sees the work they MUST do
  //     without an extra tap.
  //   - Optional / available tasks stay closed by default in both
  //     cases — they're optional, the rep can expand them when
  //     they're interested.
  // We resolve this AFTER the async task fetch lands via an effect
  // below; the initial useState values are placeholders so the page
  // renders something on first paint. A useRef guards against
  // overriding the rep's manual toggle once they've touched the
  // accordion themselves.
  const [tasksOpen, setTasksOpen] = useState(false);
  const [availOpen, setAvailOpen] = useState(false);
  // Tap-feedback overlay shown the moment the rep taps "Check out".
  // Stays mounted until the destination /check-out page mounts and
  // this page unmounts. The check-out page itself then takes over
  // with its own 3-phase overlay, so the rep sees one continuous
  // loading state from "tap" to "Saved ✓".
  const [opening, setOpening] = useState<{ customerName: string } | null>(null);
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

  // Apply the accordion defaults once tasks have loaded (May 12 —
  // Gary): if there ARE compulsory tasks, pre-expand the Tasks
  // section so the rep sees the work they must do without an extra
  // tap. If the customer has no compulsory tasks (or no tasks at
  // all) we leave it collapsed — there's nothing demanding
  // attention. The autoOpened ref guards against re-running this
  // after the rep manually toggles: once we've set the initial
  // state, we never touch it again.
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (autoOpenedRef.current) return;
    if (tasks.length === 0) return; // wait for the fetch to land
    autoOpenedRef.current = true;
    if (compulsory.length > 0) setTasksOpen(true);
  }, [tasks.length, compulsory.length]);
  const completeCount = completedTaskIds.length;
  const totalCount = tasks.length;

  // No active shift → guide the rep back to /shifts. Shows while the fetch
  // is in flight too, so we don't briefly render placeholder customer info.
  if (!shift) {
    return (
      <div style={{ background: MC.bg, minHeight: "100%" }}>
        <AppHeader title="Shift Dashboard" onBack={() => router.push("/")} />
        {!loadedShift && <LoadingBar />}
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
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                justifyContent: "center",
              }}
            >
              {!loadedShift && <Spinner size={16} />}
              {loadedShift ? "No active shift" : "Loading shift…"}
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
    const task = openSheet.task;
    setActiveTaskId(task.id);
    setActiveTaskStartedAt(Date.now());
    setOpenSheet(null);
    // Audit trail: which task / break / travel did the rep start, when?
    if (shiftData?.shiftId) {
      const isBreak = task.kind === "break";
      void logEvent({
        event_type: isBreak ? "shift.break_started" : "shift.task_started",
        shift_id: shiftData.shiftId,
        customer_id: shiftData.customerId,
        message: isBreak
          ? `Started break: ${task.name}`
          : `Started task: ${task.name}`,
        meta: {
          task_id: task.id,
          task_name: task.name,
          duration_min: task.duration,
          ...(isBreak ? { kind: "break" } : { compulsory: task.compulsory }),
        },
      });
      // Flip the shift's state column too so the admin's Live Ops
      // "On break" tab actually shows this shift while the break
      // is in flight. Fire-and-forget — the audit event above is
      // the source of truth; the state column is just a live-ops
      // index optimisation.
      if (isBreak) {
        void setShiftBreakState(shiftData.shiftId, true);
      }
    }
  };

  const completeTask = () => {
    if (!openSheet) return;
    const task = openSheet.task;
    const taskId = task.id;
    const startedAt = activeTaskStartedAt;
    setActiveTaskId(null);
    setActiveTaskStartedAt(null);
    setCompletedTaskIds((ids) => (ids.includes(taskId) ? ids : [...ids, taskId]));
    setOpenSheet(null);

    const elapsedSec = startedAt ? Math.floor((Date.now() - startedAt) / 1000) : null;
    const isBreak = task.kind === "break";

    if (shiftData?.shiftId) {
      // Per-task completion record (already in place — only for real tasks,
      // not breaks; the unique constraint is keyed off shift_task_completions
      // and break ids aren't real customer_tasks rows).
      if (!isBreak) {
        void markTaskComplete(shiftData.shiftId, taskId).then((r) => {
          if (!r.ok) {
            // eslint-disable-next-line no-console
            console.warn("[active] markTaskComplete failed:", r.error);
          }
        });
      }
      // Activity-feed event so the manager sees this in real time on the
      // Live Feed + later in audit views. Breaks log a different type so
      // we can compute paid vs unpaid time later.
      void logEvent({
        event_type: isBreak ? "shift.break_ended" : "shift.task_completed",
        shift_id: shiftData.shiftId,
        customer_id: shiftData.customerId,
        message: isBreak
          ? `Ended break: ${task.name}`
          : `Completed task: ${task.name}`,
        meta: {
          task_id: task.id,
          task_name: task.name,
          duration_min: task.duration,
          elapsed_sec: elapsedSec,
          ...(isBreak ? { kind: "break" } : {}),
        },
      });
      // Restore in-progress when the break ends. Mirror of the
      // setShiftBreakState(true) we fire on startTask above.
      if (isBreak) {
        void setShiftBreakState(shiftData.shiftId, false);
      }
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
            <CustomerTile initials={shift.initials} color={shift.color} size={48} logoUrl={shift.logoUrl} />
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
              {shift.siteName && shift.siteName !== "Head office" && (
                <div
                  style={{
                    fontFamily: MC.font,
                    fontSize: 13,
                    fontWeight: 600,
                    color: MC.brandDeep,
                    marginTop: 2,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <Glyph name="pin" size={12} color={MC.brandDeep} strokeWidth={2.4} />
                  {shift.siteName}
                </div>
              )}
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

          {/* Site contact strip — only renders when the site has any
              contact info filled in. Phone + email are tappable so a
              rep can call or message the site without leaving the
              shift screen. */}
          {(shift.siteContactName ||
            shift.siteContactPhone ||
            shift.siteContactEmail) && (
            <div
              style={{
                marginTop: 12,
                padding: "10px 12px",
                background: MC.bg,
                borderRadius: 10,
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              {shift.siteContactName && (
                <div
                  style={{
                    fontFamily: MC.font,
                    fontSize: 13,
                    fontWeight: 700,
                    color: MC.ink,
                  }}
                >
                  {shift.siteContactName}
                </div>
              )}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {shift.siteContactPhone && (
                  <a
                    href={`tel:${shift.siteContactPhone}`}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "7px 11px",
                      borderRadius: 99,
                      background: MC.brand,
                      color: "#fff",
                      fontFamily: MC.font,
                      fontSize: 12.5,
                      fontWeight: 700,
                      textDecoration: "none",
                      boxShadow: `0 4px 10px ${MC.brand}55`,
                    }}
                  >
                    <Glyph name="clock" size={13} color="#fff" strokeWidth={2.4} />
                    Call · {shift.siteContactPhone}
                  </a>
                )}
                {shift.siteContactEmail && (
                  <a
                    href={`mailto:${shift.siteContactEmail}`}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "7px 11px",
                      borderRadius: 99,
                      background: "#fff",
                      color: MC.brandDeep,
                      border: `1px solid ${MC.brand}55`,
                      fontFamily: MC.font,
                      fontSize: 12.5,
                      fontWeight: 700,
                      textDecoration: "none",
                    }}
                  >
                    Email
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Access notes — pre-arrival info ("buzz #1234, lot B"). */}
          {shift.siteNotes && (
            <div
              style={{
                marginTop: 10,
                padding: "10px 12px",
                background: "#FFF6E2",
                border: "1px solid #F2D17A",
                borderRadius: 10,
                fontFamily: MC.font,
                fontSize: 12.5,
                color: "#6d4808",
                lineHeight: 1.5,
                whiteSpace: "pre-wrap",
              }}
            >
              <div
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: 0.4,
                  textTransform: "uppercase",
                  marginBottom: 4,
                  color: "#7d5708",
                }}
              >
                Access notes
              </div>
              {shift.siteNotes}
            </div>
          )}
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
                // Show the overlay BEFORE pushing — without this the
                // rep sees a half-second dead frame between tapping
                // and the check-out page mounting its own overlay.
                setOpening({ customerName: shiftData?.name || "your shift" });
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

      {/* Geocode-task card (Feature B — May 13).
          Renders only when the shift's site is missing lat/lng.
          Treats geocoding as a synthetic task that sits ABOVE the
          real task list so the rep knows to do it first. Two
          paths: GPS-snap (most accurate when actually on-site) or
          server-side Nominatim geocode of the typed address. */}
      {shiftData && (shiftData.siteLat === null || shiftData.siteLng === null) && shiftData.siteId && (
        <div style={{ padding: "12px 16px 0" }}>
          <GeocodeTaskCard
            siteId={shiftData.siteId}
            customerId={shiftData.customerId}
            customerName={shiftData.name}
            siteAddress={shiftData.siteAddress}
            onResolved={(lat, lng) =>
              setShiftData((d) => (d ? { ...d, siteLat: lat, siteLng: lng } : d))
            }
          />
        </div>
      )}

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

      {/* Notes — rep-supplied freeform context tied to this shift.
          Auto-saves on blur via the wrapper. Admin sees it read-only
          on /shifts/[id]. */}
      {shiftData?.shiftId && (
        <>
          <SectionLabel>Notes</SectionLabel>
          <div style={{ padding: "0 16px 18px" }}>
            <ShiftNotesCard shiftId={shiftData.shiftId} initial={shiftData.repNotes ?? null} />
          </div>
        </>
      )}

      <AppFooter />

      {openSheet && shiftData && (
        <TaskSheet
          task={openSheet.task}
          shiftId={shiftData.shiftId}
          mode={sheetMode}
          elapsedSec={sheetElapsed}
          onStart={startTask}
          onComplete={completeTask}
          onClose={() => setOpenSheet(null)}
        />
      )}

      {/* "Opening…" overlay covers the gap between the rep tapping
          Check out and the /check-out page mounting its own
          phase-aware overlay. Without this the screen sits silent
          for a second or so, especially on slow networks. */}
      {opening && (
        <CheckingInOverlay
          // "leaving" — lightweight tap-feedback while /check-out
          // mounts. Same animation as "opening" but the headline
          // reads "Wrapping up…" rather than "Opening…" because
          // the rep is leaving the store, not opening anything.
          mode="leaving"
          customerName={opening.customerName}
          phase="submitting"
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
  shiftId,
  mode,
  onStart,
  onComplete,
  onClose,
  elapsedSec,
}: {
  task: Task;
  shiftId: string;
  mode: "idle" | "active" | "done";
  onStart: () => void;
  onComplete: () => void;
  onClose: () => void;
  elapsedSec: number | null;
}) {
  const isBreak = task.kind === "break";
  const accent = isBreak ? "#5b3da5" : MC.brand;

  // Feature C — photo capture. Hydrate existing photos for this
  // (shift, task) so re-opening the sheet doesn't reset slot
  // state. Realtime sub bumps the list as the rep uploads.
  const photoCount = task.photoCount ?? 0;
  const photosCompulsory = task.photosCompulsory ?? true;
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  useEffect(() => {
    if (photoCount === 0) return;
    let cancelled = false;
    const refresh = () => {
      void listShiftTaskPhotos(shiftId, task.id).then((rows) => {
        if (!cancelled) setPhotos(rows);
      });
    };
    refresh();
    const unsub = subscribeShiftTaskPhotos(shiftId, task.id, refresh);
    return () => {
      cancelled = true;
      unsub();
    };
  }, [shiftId, task.id, photoCount]);

  const filledSlots = new Set(photos.map((p) => p.slot_index));
  const photosFilledCount = filledSlots.size;
  // Block Complete when photos are mandatory and not all slots
  // are filled. Optional photos (photosCompulsory=false) just
  // disclose the count and let the rep proceed.
  const photoGateOpen =
    photoCount === 0 ||
    !photosCompulsory ||
    photosFilledCount >= photoCount;

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

          {/* Photo slot grid — Feature C. Only renders when the
              admin set photo_count > 0 on this task. Each slot
              opens the device camera via <input type="file" with
              capture="environment">. Slots fill in real time as
              the photo store finishes its compress + upload
              round-trip; cross-device subscribers see the update
              too via the shift_task_photos realtime channel. */}
          {photoCount > 0 && !isBreak && (
            <PhotoSlotGrid
              shiftId={shiftId}
              taskId={task.id}
              photoCount={photoCount}
              compulsory={photosCompulsory}
              photos={photos}
            />
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
                onClick={photoGateOpen ? onComplete : undefined}
                disabled={!photoGateOpen}
                style={{
                  width: "100%",
                  height: 54,
                  borderRadius: 14,
                  border: "none",
                  background: photoGateOpen ? MC.brand : MC.line,
                  color: "#fff",
                  fontFamily: MC.font,
                  fontSize: 16,
                  fontWeight: 600,
                  cursor: photoGateOpen ? "pointer" : "not-allowed",
                  boxShadow: photoGateOpen ? `0 10px 24px ${MC.brand}55` : "none",
                  opacity: photoGateOpen ? 1 : 0.85,
                }}
              >
                {isBreak
                  ? "End break"
                  : photoGateOpen
                  ? "Complete task"
                  : `Add ${photoCount - photosFilledCount} more photo${
                      photoCount - photosFilledCount === 1 ? "" : "s"
                    } to complete`}
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

/**
 * ShiftNotesCard — freeform textarea that auto-saves on blur. Keeps
 * the rep's notes tied to a specific shift so admin can read them on
 * /shifts/[id] later. Empty/whitespace-only saves clear the note.
 *
 * Save UX:
 *   - Edits are local until blur
 *   - On blur, if the trimmed value differs from the last-saved
 *     snapshot, we call saveShiftNotes
 *   - Shows a "Saved" pip for 2 s after a successful save so the
 *     rep gets visible confirmation
 */
function ShiftNotesCard({
  shiftId,
  initial,
}: {
  shiftId: string;
  initial: string | null;
}) {
  const [text, setText] = useState<string>(initial ?? "");
  const [lastSaved, setLastSaved] = useState<string>(initial ?? "");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (savedAt == null) return;
    const id = window.setTimeout(() => setSavedAt(null), 2000);
    return () => window.clearTimeout(id);
  }, [savedAt]);

  const persist = useCallback(async () => {
    const trimmed = text.trim();
    if (trimmed === lastSaved.trim()) return;
    setSaving(true);
    setError(null);
    const r = await saveShiftNotes(shiftId, text);
    setSaving(false);
    if (!r.ok) {
      setError(r.error || "Couldn't save your note. Try again?");
      return;
    }
    setLastSaved(trimmed);
    setSavedAt(Date.now());
  }, [text, lastSaved, shiftId]);

  // Debounced auto-save while typing — fires 1.5s after the last
  // keystroke. Previously we only saved onBlur, which is fragile on
  // mobile PWAs: tapping the hardware back button, locking the
  // screen, or navigating from the side menu doesn't always blur
  // the textarea, so the user "saves" a note and it never lands.
  // Belt-and-braces: onBlur still saves immediately so explicit
  // dismissals are instant.
  useEffect(() => {
    if (text.trim() === lastSaved.trim()) return;
    const t = window.setTimeout(() => {
      void persist();
    }, 1500);
    return () => window.clearTimeout(t);
  }, [text, lastSaved, persist]);

  // Save on tab hide / page unload too — a rep who quickly switches
  // apps after typing should not lose the note. visibilitychange
  // fires more reliably than beforeunload on mobile browsers; the
  // unload handler is the desktop / refresh fallback.
  useEffect(() => {
    const flush = () => {
      if (text.trim() !== lastSaved.trim()) {
        void persist();
      }
    };
    const onVis = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", flush);
    };
  }, [text, lastSaved, persist]);

  return (
    <div
      style={{
        background: MC.card,
        borderRadius: MC.radiusCard,
        border: `1px solid ${MC.line}`,
        padding: 12,
      }}
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          void persist();
        }}
        placeholder="Anything the manager should know about this shift? (Auto-saves)"
        rows={4}
        style={{
          width: "100%",
          padding: "10px 12px",
          border: `1px solid ${MC.line}`,
          borderRadius: 10,
          background: "#fff",
          fontFamily: MC.font,
          fontSize: 14,
          color: MC.ink,
          lineHeight: 1.45,
          resize: "vertical",
          minHeight: 88,
          outline: "none",
        }}
      />
      <div
        style={{
          marginTop: 6,
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontFamily: MC.font,
          fontSize: 11.5,
          color: MC.mute,
          minHeight: 16,
        }}
      >
        {saving && <span>Saving…</span>}
        {!saving && savedAt && (
          <span style={{ color: "#0d6a45", fontWeight: 600 }}>Saved ✓</span>
        )}
        {!saving && !savedAt && error && (
          <span style={{ color: MC.danger, fontWeight: 600 }}>{error}</span>
        )}
        {!saving && !savedAt && !error && text.trim().length > 0 && (
          <span>Auto-saves when you tap outside the box.</span>
        )}
      </div>
    </div>
  );
}

// ─── Geocode-task card (Feature B — May 13) ────────────────────────
//
// Synthetic task that surfaces at the top of /active when the
// shift's customer_sites row is missing lat/lng. The rep can
// resolve it two ways:
//
//   - "Use my current location" — calls requestGeolocationOnce
//     and writes those coords directly. Most accurate when the
//     rep is actually at the site (which they should be, since
//     they're on /active).
//   - "Geocode address" — POSTs the typed site address to the
//     local /api/geocode proxy (Nominatim). Falls back to the GPS
//     path if Nominatim returns no match.
//
// Either path writes the coords to customer_sites + the parent
// customers row (if it was still null), and logs a
// customer.geocoded event for the admin Live Ops feed. The
// onResolved callback bubbles the new coords up so the card
// disappears immediately without a refetch.
function GeocodeTaskCard({
  siteId,
  customerId,
  customerName,
  siteAddress,
  onResolved,
}: {
  siteId: string;
  customerId: string;
  customerName: string;
  siteAddress: string | null;
  onResolved: (lat: number, lng: number) => void;
}) {
  const [busy, setBusy] = useState<"gps" | "address" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runGps = async () => {
    setError(null);
    setBusy("gps");
    const pos = await requestGeolocationOnce();
    if (!pos) {
      setBusy(null);
      setError("Couldn't read your location. Allow location for Morpheus in browser settings.");
      return;
    }
    const r = await setCustomerSiteCoords({
      siteId,
      customerId,
      latitude: pos.lat,
      longitude: pos.lng,
      source: "gps",
      resolvedDescription: "Rep's device GPS",
    });
    setBusy(null);
    if (!r.ok) {
      setError(r.error || "Couldn't save — try again.");
      return;
    }
    onResolved(pos.lat, pos.lng);
  };

  const runAddress = async () => {
    if (!siteAddress) {
      setError("No address on file to geocode. Use GPS instead.");
      return;
    }
    setError(null);
    setBusy("address");
    const hit = await geocodeAddress(siteAddress);
    if (!hit) {
      setBusy(null);
      setError("Couldn't find that address. Try GPS, or ask your manager to clean up the address.");
      return;
    }
    const r = await setCustomerSiteCoords({
      siteId,
      customerId,
      latitude: hit.latitude,
      longitude: hit.longitude,
      source: "address",
      resolvedDescription: hit.displayName,
    });
    setBusy(null);
    if (!r.ok) {
      setError(r.error || "Couldn't save — try again.");
      return;
    }
    onResolved(hit.latitude, hit.longitude);
  };

  return (
    <div
      style={{
        background: MC.warnTint,
        border: `1px solid ${MC.warn}55`,
        borderLeft: `3px solid ${MC.warn}`,
        borderRadius: 12,
        padding: "12px 14px",
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
        <Glyph name="pin" size={18} color={MC.warn} strokeWidth={2.4} />
        <div
          style={{
            fontFamily: MC.font,
            fontSize: 14,
            fontWeight: 700,
            color: "#7A560A",
            letterSpacing: -0.1,
          }}
        >
          Set this customer&apos;s location
        </div>
      </div>
      <div
        style={{
          fontFamily: MC.font,
          fontSize: 12.5,
          color: "#7A560A",
          lineHeight: 1.5,
          marginBottom: 10,
        }}
      >
        {customerName} doesn&apos;t have a pin yet. Setting it now means
        your next check-in here works geofenced + manager can see it
        on the map.
      </div>
      {siteAddress && (
        <div
          style={{
            fontFamily: MC.font,
            fontSize: 11.5,
            color: MC.mute,
            marginBottom: 12,
            background: "rgba(255,255,255,.6)",
            padding: "6px 10px",
            borderRadius: 8,
            border: `1px solid ${MC.warn}22`,
          }}
        >
          Address on file: {siteAddress}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={runGps}
          disabled={!!busy}
          style={{
            flex: "1 1 auto",
            minWidth: 0,
            padding: "10px 12px",
            borderRadius: 10,
            background: MC.brandDeep,
            color: "#fff",
            border: "none",
            cursor: busy ? "wait" : "pointer",
            fontFamily: MC.font,
            fontSize: 13,
            fontWeight: 700,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            opacity: busy === "gps" ? 0.7 : 1,
          }}
        >
          <Glyph name="target" size={14} color="#fff" strokeWidth={2.4} />
          {busy === "gps" ? "Pinning…" : "Use my current location"}
        </button>
        <button
          type="button"
          onClick={runAddress}
          disabled={!!busy || !siteAddress}
          style={{
            flex: "1 1 auto",
            minWidth: 0,
            padding: "10px 12px",
            borderRadius: 10,
            background: "#fff",
            color: MC.brandDeep,
            border: `1px solid ${MC.brand}55`,
            cursor: busy || !siteAddress ? "not-allowed" : "pointer",
            fontFamily: MC.font,
            fontSize: 13,
            fontWeight: 700,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            opacity: busy === "address" || !siteAddress ? 0.7 : 1,
          }}
        >
          <Glyph name="pin" size={14} color={MC.brandDeep} strokeWidth={2.4} />
          {busy === "address" ? "Looking up…" : "Geocode address"}
        </button>
      </div>
      {error && (
        <div
          style={{
            marginTop: 10,
            fontFamily: MC.font,
            fontSize: 12,
            color: "#9c1a3c",
            lineHeight: 1.4,
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}

// ─── Photo slot grid (Feature C — May 13) ──────────────────────────
//
// Renders N camera slots inside the TaskSheet when the admin set
// photo_count > 0 on the task. Each slot is one of:
//
//   - Empty   → camera icon + "Slot N". Tap → native camera/picker.
//   - Filled  → thumbnail loaded from the public Supabase URL.
//               Tap → preview overlay with Delete + Retake actions.
//   - Busy    → spinner overlay while compressing + uploading.
//
// Each slot wraps a hidden <input type="file" accept="image/*"
// capture="environment"> — on iOS Safari / Android Chrome this
// opens the rear camera directly. With capture omitted it falls
// back to the OS photo picker, useful for picking an existing
// shot too if the rep already captured one.

function PhotoSlotGrid({
  shiftId,
  taskId,
  photoCount,
  compulsory,
  photos,
}: {
  shiftId: string;
  taskId: string;
  photoCount: number;
  compulsory: boolean;
  photos: UploadedPhoto[];
}) {
  // Map slot_index → photo for O(1) lookup. Slots use a stable
  // 0..N-1 index so re-shoots don't reshuffle thumbnails.
  const bySlot = useMemo(() => {
    const m = new Map<number, UploadedPhoto>();
    for (const p of photos) m.set(p.slot_index, p);
    return m;
  }, [photos]);

  const [busySlot, setBusySlot] = useState<number | null>(null);
  const [slotError, setSlotError] = useState<{ slot: number; msg: string } | null>(
    null
  );
  const [previewing, setPreviewing] = useState<UploadedPhoto | null>(null);

  const handleFile = async (slotIndex: number, file: File) => {
    setSlotError(null);
    setBusySlot(slotIndex);
    const r = await uploadShiftTaskPhoto({
      shiftId,
      taskId,
      slotIndex,
      file,
    });
    setBusySlot(null);
    if (!r.ok) {
      setSlotError({ slot: slotIndex, msg: r.error });
    }
    // No state push needed — the realtime sub on the parent will
    // refresh the photos array within a fraction of a second.
  };

  const handleDelete = async (photo: UploadedPhoto) => {
    setPreviewing(null);
    const r = await deleteShiftTaskPhoto(photo);
    if (!r.ok) setSlotError({ slot: photo.slot_index, msg: r.error ?? "" });
  };

  return (
    <div style={{ marginTop: 18 }}>
      <div
        style={{
          fontFamily: MC.font,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 0.5,
          textTransform: "uppercase",
          color: MC.hint,
          marginBottom: 8,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <Glyph name="camera" size={12} color={MC.hint} strokeWidth={2.4} />
        Photos
        <span style={{ color: MC.mute, fontWeight: 500 }}>
          · {bySlot.size}/{photoCount}
          {compulsory ? "" : " · optional"}
        </span>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${photoCount <= 3 ? photoCount : 3}, 1fr)`,
          gap: 8,
        }}
      >
        {Array.from({ length: photoCount }).map((_, i) => {
          const photo = bySlot.get(i);
          const isBusy = busySlot === i;
          return (
            <div key={i} style={{ position: "relative" }}>
              {photo ? (
                // Filled slot — thumbnail tap opens preview.
                <button
                  type="button"
                  onClick={() => setPreviewing(photo)}
                  style={{
                    width: "100%",
                    aspectRatio: "1 / 1",
                    borderRadius: 10,
                    border: `1px solid ${MC.line}`,
                    background: `url(${photo.public_url}) center/cover no-repeat`,
                    cursor: "pointer",
                    padding: 0,
                    position: "relative",
                  }}
                  aria-label={`Photo ${i + 1} — tap to preview`}
                >
                  <span
                    aria-hidden
                    style={{
                      position: "absolute",
                      top: 4,
                      right: 4,
                      background: "rgba(10,15,30,.6)",
                      color: "#fff",
                      fontFamily: MC.font,
                      fontSize: 10,
                      fontWeight: 700,
                      padding: "2px 6px",
                      borderRadius: 4,
                      letterSpacing: 0.3,
                    }}
                  >
                    {i + 1}
                  </span>
                </button>
              ) : (
                // Empty slot — label wraps a hidden file input that
                // opens the device camera on tap. `capture` hints
                // the rear camera; the user can still switch to
                // the photo library from there.
                <label
                  style={{
                    width: "100%",
                    aspectRatio: "1 / 1",
                    borderRadius: 10,
                    border: `1.5px dashed ${isBusy ? MC.brand : MC.line}`,
                    background: isBusy ? MC.brandTint : MC.bg,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 4,
                    cursor: isBusy ? "wait" : "pointer",
                    color: isBusy ? MC.brandDeep : MC.mute,
                  }}
                >
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    disabled={isBusy}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleFile(i, f);
                      e.target.value = ""; // allow re-pick of same file
                    }}
                    style={{
                      position: "absolute",
                      opacity: 0,
                      width: 0,
                      height: 0,
                    }}
                  />
                  <Glyph
                    name="camera"
                    size={20}
                    color={isBusy ? MC.brandDeep : MC.mute}
                    strokeWidth={2.2}
                  />
                  <span
                    style={{
                      fontFamily: MC.font,
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  >
                    {isBusy ? "Uploading…" : `Slot ${i + 1}`}
                  </span>
                </label>
              )}
              {slotError?.slot === i && (
                <div
                  style={{
                    fontFamily: MC.font,
                    fontSize: 10.5,
                    color: "#9c1a3c",
                    marginTop: 4,
                    lineHeight: 1.3,
                  }}
                >
                  {slotError.msg || "Upload failed — tap to retry"}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Fullscreen preview overlay — tap outside to close,
          Delete to remove the photo + clear the slot. */}
      {previewing && (
        <div
          role="dialog"
          onClick={() => setPreviewing(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            background: "rgba(10,15,30,.92)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <img
            src={previewing.public_url}
            alt={`Photo for slot ${previewing.slot_index + 1}`}
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: "100%",
              maxHeight: "70%",
              borderRadius: 12,
              boxShadow: "0 12px 40px rgba(0,0,0,.5)",
            }}
          />
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ display: "flex", gap: 10, marginTop: 20 }}
          >
            <button
              type="button"
              onClick={() => handleDelete(previewing)}
              style={{
                padding: "10px 16px",
                borderRadius: 10,
                background: MC.danger,
                color: "#fff",
                border: "none",
                fontFamily: MC.font,
                fontSize: 14,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => setPreviewing(null)}
              style={{
                padding: "10px 16px",
                borderRadius: 10,
                background: "rgba(255,255,255,.15)",
                color: "#fff",
                border: "none",
                fontFamily: MC.font,
                fontSize: 14,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
