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
import { setCustomerSiteCoords } from "@/lib/customers-store";
import {
  uploadShiftTaskPhoto,
  listShiftTaskPhotos,
  deleteShiftTaskPhoto,
  subscribeShiftTaskPhotos,
  type UploadedPhoto,
} from "@/lib/photo-store";
import {
  saveShiftTaskSignature,
  getShiftTaskSignature,
  subscribeShiftTaskSignatures,
} from "@/lib/signature-store";
import { SignaturePad } from "@/components/SignaturePad";
import { MapPreview } from "@/components/MapPreview";
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
  /** Shift state — "in-progress", "on-break", "travelling", etc.
   *  Drives the pause/resume banner at the top of the active page.
   *  Pulled from the DB on mount + every refetch so the page
   *  reflects realtime flips (manager reassign, auto-checkout,
   *  rep pause from another device). */
  state: string;
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
        state: s.state,
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
          requiresSignature: r.requires_signature ?? false,
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

  // Pause-aware timer state (May 14). When the shift is on-break the
  // displayed elapsed time should FREEZE at the moment of pause and
  // resume from where it stopped — the ticking clock kept counting
  // through the pause before this change. Two localStorage-backed
  // numbers per shift:
  //   - pause_since: epoch ms when the CURRENT pause started, or null
  //   - pause_offset: total ms accumulated from completed prior pauses
  // Display elapsed = effectiveNow - shiftStartTs - pause_offset
  //   where effectiveNow = pause_since (frozen)  while paused
  //                      = Date.now()            otherwise
  const pauseSinceKey = shiftData?.shiftId
    ? `morpheus.shift_pause_since.${shiftData.shiftId}`
    : null;
  const pauseOffsetKey = shiftData?.shiftId
    ? `morpheus.shift_pause_offset.${shiftData.shiftId}`
    : null;
  const [pauseSince, setPauseSince] = useState<number | null>(() => {
    if (typeof window === "undefined" || !shiftData?.shiftId) return null;
    const raw = window.localStorage.getItem(
      `morpheus.shift_pause_since.${shiftData.shiftId}`
    );
    return raw ? Number(raw) || null : null;
  });
  const [pauseOffsetMs, setPauseOffsetMs] = useState<number>(() => {
    if (typeof window === "undefined" || !shiftData?.shiftId) return 0;
    const raw = window.localStorage.getItem(
      `morpheus.shift_pause_offset.${shiftData.shiftId}`
    );
    return raw ? Number(raw) || 0 : 0;
  });
  // Sync state ↔ localStorage whenever either value changes. Two
  // tiny writes per pause/resume, no measurable overhead.
  useEffect(() => {
    if (typeof window === "undefined" || !pauseSinceKey) return;
    if (pauseSince == null) window.localStorage.removeItem(pauseSinceKey);
    else window.localStorage.setItem(pauseSinceKey, String(pauseSince));
  }, [pauseSince, pauseSinceKey]);
  useEffect(() => {
    if (typeof window === "undefined" || !pauseOffsetKey) return;
    window.localStorage.setItem(pauseOffsetKey, String(pauseOffsetMs));
  }, [pauseOffsetMs, pauseOffsetKey]);
  // When the DB state flips, fold the current pause into pauseOffsetMs
  // (on resume) or start a new pause window (on pause). Watches the
  // shift's state field — fires on optimistic flips AND on realtime
  // refetch echoes.
  useEffect(() => {
    if (!shiftData) return;
    const isPaused = shiftData.state === "on-break";
    if (isPaused && pauseSince == null) {
      setPauseSince(Date.now());
    } else if (!isPaused && pauseSince != null) {
      setPauseOffsetMs((prev) => prev + (Date.now() - pauseSince));
      setPauseSince(null);
    }
  }, [shiftData?.state, shiftData, pauseSince]);

  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [activeTaskStartedAt, setActiveTaskStartedAt] = useState<number | null>(null);
  const [completedTaskIds, setCompletedTaskIds] = useState<string[]>([]);
  const [openSheet, setOpenSheet] = useState<{ task: Task } | null>(null);

  // ─── Direct-camera flow for photo tasks (May 13) ──────────────────
  //
  // Photo tasks open the camera ON TAP, not a sheet — the workflow
  // is "tap → camera → upload → next photo → … → done" with the task
  // auto-completing after the last upload. The sheet only opens for
  // non-photo tasks or for COMPLETED photo tasks (where the rep
  // might want to retake / review).
  //
  // Drives the page-level hidden file input below. photoFlow.taskId
  // identifies which task is currently capturing; nextSlot is the
  // empty slot index (0..N-1) the next capture should fill.
  const [photoFlow, setPhotoFlow] = useState<{
    taskId: string;
    nextSlot: number;
    totalSlots: number;
    /** Whether an upload is in flight — drives the overlay. */
    uploading: boolean;
    /** Error from the last upload attempt, surfaced as a banner. */
    error: string | null;
  } | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  // Map (taskId → photo count) so the TaskRow can show progress
  // ("2 of 3 photos") without each row independently subscribing.
  // Hydrated lazily — initial empty Map is fine, gets filled as the
  // rep interacts and the page-level refresh runs.
  const [taskPhotoCounts, setTaskPhotoCounts] = useState<Map<string, number>>(
    () => new Map()
  );

  // ─── Signature flow (Feature D — May 13) ─────────────────────────
  //
  // signaturePad.taskId controls whether the SignaturePad modal is
  // mounted. saving + error mirror the photo-flow shape so the modal
  // can show its spinner + inline error states without a second
  // state hook. signedTaskIds caches "we have a signature for this
  // task" so the TaskRow can render a signed pill.
  const [signaturePad, setSignaturePad] = useState<{
    task: Task;
    saving: boolean;
    error: string | null;
    initialDataUrl: string | null;
    initialSignerName: string | null;
  } | null>(null);
  const [signedTaskIds, setSignedTaskIds] = useState<Set<string>>(
    () => new Set()
  );

  const refreshSignatureFor = useCallback(
    async (taskId: string): Promise<boolean> => {
      if (!shiftData?.shiftId) return false;
      const row = await getShiftTaskSignature(shiftData.shiftId, taskId);
      setSignedTaskIds((prev) => {
        const next = new Set(prev);
        if (row) next.add(taskId);
        else next.delete(taskId);
        return next;
      });
      return !!row;
    },
    [shiftData?.shiftId]
  );

  // Refresh the photo count for a given task. Called on mount for
  // photo tasks + after each upload.
  const refreshPhotoCount = useCallback(
    async (taskId: string): Promise<number> => {
      if (!shiftData?.shiftId) return 0;
      const photos = await listShiftTaskPhotos(shiftData.shiftId, taskId);
      setTaskPhotoCounts((prev) => {
        const next = new Map(prev);
        next.set(taskId, photos.length);
        return next;
      });
      return photos.length;
    },
    [shiftData?.shiftId]
  );

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

  // Pause-aware elapsed (May 14). While the shift is paused we freeze
  // at the pause moment; once resumed we keep counting from where we
  // left off by subtracting the accumulated pause duration.
  const effectiveNow = pauseSince != null ? pauseSince : now;
  const elapsed = Math.max(
    0,
    Math.floor((effectiveNow - shiftStartTs - pauseOffsetMs) / 1000)
  );
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

  // The "no active shift" empty state used to early-return here, but
  // that caused React error #310: hooks defined further down (photo
  // flow, signature flow, hydration effects) were skipped on the
  // first render and called on subsequent renders, violating the
  // Rules of Hooks. The check now lives just before the main render
  // below — every hook on this page is called unconditionally
  // every render. See git history for the full conditional-return
  // version if you need to read the empty state's history.

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

  // ─── Photo-flow logic (Feature C — May 13 cleanup) ────────────────
  //
  // Entry point: called when the rep taps a photo task with empty
  // slots. Fetches current photo state, finds the next empty slot,
  // and triggers the page-level file input (which opens the device
  // camera). Subsequent captures chain via the input's onChange.

  /** Auto-complete a photo task when its last slot just got filled.
   *  Mirrors the logic in completeTask() but operates on a taskId
   *  directly (no openSheet dependency). */
  const autoCompletePhotoTask = useCallback(
    (taskId: string) => {
      const wasActive = activeTaskId === taskId;
      if (wasActive) {
        setActiveTaskId(null);
        setActiveTaskStartedAt(null);
      }
      setCompletedTaskIds((ids) => (ids.includes(taskId) ? ids : [...ids, taskId]));
      if (shiftData?.shiftId) {
        const elapsedSec =
          wasActive && activeTaskStartedAt
            ? Math.floor((Date.now() - activeTaskStartedAt) / 1000)
            : null;
        void markTaskComplete(shiftData.shiftId, taskId).then((r) => {
          if (!r.ok) {
            // eslint-disable-next-line no-console
            console.warn("[active] auto-mark task complete failed:", r.error);
          }
        });
        const completed = tasks.find((t) => t.id === taskId);
        void logEvent({
          event_type: "shift.task_completed",
          shift_id: shiftData.shiftId,
          customer_id: shiftData.customerId,
          message: `Completed task: ${completed?.name ?? "photo task"}`,
          meta: {
            task_id: taskId,
            task_name: completed?.name,
            duration_min: completed?.duration,
            elapsed_sec: elapsedSec,
            auto_completed: "photos_filled",
          },
        });
      }
    },
    [activeTaskId, activeTaskStartedAt, shiftData, tasks]
  );

  const startPhotoFlow = useCallback(
    // SYNCHRONOUS — no async, no await, no rAF, no setTimeout.
    // iOS standalone PWA only treats the file picker as user-initiated
    // when input.click() runs in the SAME call stack as the tap
    // handler. ANY async hop (await, rAF, setTimeout) drops the
    // "transient activation" flag and the OS silently blocks the
    // popup. That was the long-standing "nothing happens when I tap"
    // bug: the previous version awaited refreshPhotoCount before
    // calling click(), which works fine on Android Chrome / desktop
    // but is the textbook iOS PWA gotcha.
    (task: Task) => {
      const totalSlots = task.photoCount ?? 0;
      if (totalSlots === 0 || !shiftData?.shiftId) return;
      // Read the cached photo count from state (hydrated by the
      // page-level useEffect that runs listShiftTaskPhotos on mount
      // + after each upload). It can be stale by ~milliseconds if
      // another tab uploaded in parallel — we tolerate that. The
      // worst case: the rep takes a photo we then discard because
      // the slot was already filled. Better than the rep tapping a
      // dead button.
      const existingCount = taskPhotoCounts.get(task.id) ?? 0;
      if (existingCount >= totalSlots) {
        autoCompletePhotoTask(task.id);
        return;
      }
      setPhotoFlow({
        taskId: task.id,
        nextSlot: existingCount,
        totalSlots,
        uploading: false,
        error: null,
      });
      // The hidden <input ref={photoInputRef}> is ALWAYS mounted at
      // page level (see render below), so the ref is non-null from
      // the first render onward. No need to wait for React to mount
      // anything — click() lands on a live DOM node immediately.
      photoInputRef.current?.click();
    },
    [shiftData?.shiftId, taskPhotoCounts, autoCompletePhotoTask]
  );

  const onPhotoCaptureFile = useCallback(
    async (file: File) => {
      if (!photoFlow || !shiftData?.shiftId) return;
      setPhotoFlow((prev) =>
        prev ? { ...prev, uploading: true, error: null } : prev
      );
      const r = await uploadShiftTaskPhoto({
        shiftId: shiftData.shiftId,
        taskId: photoFlow.taskId,
        slotIndex: photoFlow.nextSlot,
        file,
      });
      if (!r.ok) {
        setPhotoFlow((prev) =>
          prev ? { ...prev, uploading: false, error: r.error } : prev
        );
        return;
      }
      const newCount = await refreshPhotoCount(photoFlow.taskId);
      if (newCount >= photoFlow.totalSlots) {
        // All photo slots filled. If this task ALSO requires a
        // signature and we don't have one yet, hop straight into
        // the signature pad. Otherwise auto-complete.
        //
        // We inline the signature-open here (rather than calling
        // startSignatureFlow) so we don't have to forward-reference
        // startSignatureFlow from this callback's deps list. The
        // signature row hasn't been fetched yet at this point — we
        // pass null initial data, which means a fresh pad rather
        // than a pre-fill. That's fine: by definition we're here
        // because no signature exists yet.
        const task = tasks.find((t) => t.id === photoFlow.taskId);
        const needsSig =
          task?.requiresSignature && !signedTaskIds.has(photoFlow.taskId);
        setPhotoFlow(null);
        if (task && needsSig) {
          setSignaturePad({
            task,
            saving: false,
            error: null,
            initialDataUrl: null,
            initialSignerName: null,
          });
        } else {
          autoCompletePhotoTask(photoFlow.taskId);
        }
        return;
      }
      // More slots to go — leave photoFlow set with the new nextSlot
      // and uploading=false. The overlay renders a "Take photo N of
      // M" button in this state — a tap on it is a fresh user gesture
      // that iOS standalone PWA respects, so the camera opens cleanly.
      //
      // Earlier we tried auto-chaining via requestAnimationFrame, but
      // by the time rAF fires the user activation from the file-pick
      // has expired on iOS and the OS blocks the popup. One extra tap
      // per photo is a small UX cost for "this actually works on every
      // device" — and Android Chrome / desktop browsers still feel
      // snappy because the button is visible the moment the upload
      // resolves.
      setPhotoFlow((prev) =>
        prev
          ? {
              ...prev,
              nextSlot: newCount,
              uploading: false,
              error: null,
            }
          : prev
      );
    },
    [
      photoFlow,
      shiftData?.shiftId,
      refreshPhotoCount,
      autoCompletePhotoTask,
      tasks,
      signedTaskIds,
    ]
  );

  // Hydrate photo counts for all photo tasks on mount + whenever the
  // task list changes. Used by the TaskRow progress pill so the rep
  // sees "2/3 photos" without opening anything.
  useEffect(() => {
    const photoTasks = tasks.filter((t) => (t.photoCount ?? 0) > 0);
    photoTasks.forEach((t) => {
      void refreshPhotoCount(t.id);
    });
  }, [tasks, refreshPhotoCount]);

  // Hydrate signature presence for all signature tasks on mount +
  // whenever the task list changes. Mirrors the photo-count hydration
  // above so the TaskRow can show a "Signed" pill without each row
  // independently subscribing.
  useEffect(() => {
    const signatureTasks = tasks.filter((t) => t.requiresSignature);
    signatureTasks.forEach((t) => {
      void refreshSignatureFor(t.id);
    });
  }, [tasks, refreshSignatureFor]);

  // ─── Signature flow handlers (Feature D — May 13) ─────────────────

  /** Auto-complete a signature-only task once a signature lands.
   *  Shape matches autoCompletePhotoTask. */
  const autoCompleteSignatureTask = useCallback(
    (taskId: string) => {
      const wasActive = activeTaskId === taskId;
      if (wasActive) {
        setActiveTaskId(null);
        setActiveTaskStartedAt(null);
      }
      setCompletedTaskIds((ids) =>
        ids.includes(taskId) ? ids : [...ids, taskId]
      );
      if (shiftData?.shiftId) {
        const elapsedSec =
          wasActive && activeTaskStartedAt
            ? Math.floor((Date.now() - activeTaskStartedAt) / 1000)
            : null;
        void markTaskComplete(shiftData.shiftId, taskId).then((r) => {
          if (!r.ok) {
            // eslint-disable-next-line no-console
            console.warn("[active] auto-mark signature task failed:", r.error);
          }
        });
        const completed = tasks.find((t) => t.id === taskId);
        void logEvent({
          event_type: "shift.task_completed",
          shift_id: shiftData.shiftId,
          customer_id: shiftData.customerId,
          message: `Completed task: ${completed?.name ?? "signature task"}`,
          meta: {
            task_id: taskId,
            task_name: completed?.name,
            duration_min: completed?.duration,
            elapsed_sec: elapsedSec,
            auto_completed: "signature_captured",
          },
        });
      }
    },
    [activeTaskId, activeTaskStartedAt, shiftData, tasks]
  );

  /** Open the signature pad for a given task. Pre-fills the pad with
   *  any existing signature so a re-sign starts from where they
   *  were (rather than a blank canvas). */
  const startSignatureFlow = useCallback(
    async (task: Task) => {
      if (!shiftData?.shiftId) return;
      const existing = await getShiftTaskSignature(
        shiftData.shiftId,
        task.id
      );
      setSignaturePad({
        task,
        saving: false,
        error: null,
        initialDataUrl: existing?.signature_data_url ?? null,
        initialSignerName: existing?.signer_name ?? null,
      });
    },
    [shiftData?.shiftId]
  );

  const handleSaveSignature = useCallback(
    async (args: { signatureDataUrl: string; signerName: string | null }) => {
      if (!signaturePad || !shiftData?.shiftId) return;
      setSignaturePad((prev) =>
        prev ? { ...prev, saving: true, error: null } : prev
      );
      const r = await saveShiftTaskSignature({
        shiftId: shiftData.shiftId,
        taskId: signaturePad.task.id,
        signatureDataUrl: args.signatureDataUrl,
        signerName: args.signerName,
      });
      if (!r.ok) {
        setSignaturePad((prev) =>
          prev ? { ...prev, saving: false, error: r.error } : prev
        );
        return;
      }
      const taskId = signaturePad.task.id;
      await refreshSignatureFor(taskId);
      // Photo + signature combo: only complete when BOTH gates pass.
      // Signature-only: complete now.
      const task = signaturePad.task;
      const photoNeeded = task.photoCount ?? 0;
      if (photoNeeded === 0) {
        autoCompleteSignatureTask(taskId);
      } else {
        // Both gates required — check if photos are also done.
        const photosTaken = taskPhotoCounts.get(taskId) ?? 0;
        if (photosTaken >= photoNeeded) {
          autoCompleteSignatureTask(taskId);
        }
        // Else the photo flow's last upload will trigger completion.
      }
      setSignaturePad(null);
    },
    [
      signaturePad,
      shiftData?.shiftId,
      refreshSignatureFor,
      autoCompleteSignatureTask,
      taskPhotoCounts,
    ]
  );

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

  // No active shift → guide the rep back to /shifts. Shows while the
  // fetch is in flight too, so we don't briefly render placeholder
  // customer info. Must live AFTER every hook on this page — see
  // the explanatory comment further up where this used to live.
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

  return (
    <div style={{ background: MC.bg, minHeight: "100%", position: "relative" }}>
      <AppHeader title="Shift Dashboard" />

      {/* Paused info banner. Renders when shifts.state === 'on-break'.
          Info-only — no Resume button here (May 14, Gary). The
          Pause button in the hero below DOUBLES as Resume when the
          shift is on-break, so there's no need for a second action
          target up here. Banner just tells the rep what's happening
          + that Check-out is locked. */}
      {shiftData?.state === "on-break" && (
        <div style={{ padding: "12px 16px 0" }}>
          <div
            style={{
              background: MC.warnTint,
              border: `1px solid ${MC.warn}55`,
              borderLeft: `3px solid ${MC.warn}`,
              borderRadius: 12,
              padding: "12px 14px",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <Glyph name="pause" size={20} color={MC.warn} strokeWidth={2.4} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontFamily: MC.font,
                  fontSize: 14,
                  fontWeight: 700,
                  color: "#7A560A",
                  letterSpacing: -0.1,
                }}
              >
                Shift paused
              </div>
              <div
                style={{
                  fontFamily: MC.font,
                  fontSize: 12.5,
                  color: "#7A560A",
                  marginTop: 2,
                  lineHeight: 1.4,
                }}
              >
                Tap Resume below to keep going. Check-out is locked
                until you resume.
              </div>
            </div>
          </div>
        </div>
      )}

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

          {/* Address row (May 13, slimmed May 14). Surfaces the
              site's physical address right under the customer block
              so the rep can see where they actually are. Tapping
              opens Google Maps in a new tab. When the site has no
              address on file we still render the row but say so
              explicitly — a "no address" empty state is clearer
              than the absence of any row. Padding + icon size +
              type scale all dropped one notch per Gary's "card is a
              touch too big" feedback so the address reads as a
              line of info, not a hero. */}
          {/* Location row — three states:
              1. Coords + address  → small inline map + address text
                 (calm; tappable to open Google Maps)
              2. Coords + NO address → small inline map + "Pinned
                 location" label. Previously this fell through to
                 "flag manager" which was wrong — a site CAN have
                 coords from a rep-geocode without ever having a
                 street address typed in. (Gary's report May 14.)
              3. No coords         → render nothing here. The
                 GeocodeTaskCard above the hero owns the "needs
                 geocoding" affordance; duplicating a "flag manager"
                 warning under the hero would be noise.
              The map preview is the cool-little-map per Gary's ask
              — visible at a glance, no tap needed. Tapping the
              entire row still deep-links to Google Maps. */}
          {(shift.siteLat != null && shift.siteLng != null) && (
            <div
              style={{
                marginTop: 10,
                borderRadius: 10,
                border: `1px solid ${MC.line}`,
                overflow: "hidden",
                background: "#fff",
              }}
            >
              <MapPreview
                latitude={shift.siteLat}
                longitude={shift.siteLng}
                height={110}
              />
              <a
                href={
                  shift.siteAddress
                    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(shift.siteAddress)}`
                    : `https://www.google.com/maps/search/?api=1&query=${shift.siteLat},${shift.siteLng}`
                }
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 10px",
                  textDecoration: "none",
                  borderTop: `1px solid ${MC.line}`,
                }}
                title={shift.siteAddress || "Pinned location"}
              >
                <span
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 5,
                    background: MC.brandTint,
                    border: `1px solid ${MC.brand}33`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Glyph
                    name="pin"
                    size={10}
                    color={MC.brandDeep}
                    strokeWidth={2.4}
                  />
                </span>
                <div
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontFamily: MC.font,
                    fontSize: 11.5,
                    color: shift.siteAddress ? MC.ink2 : MC.mute,
                    lineHeight: 1.35,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    fontStyle: shift.siteAddress ? "normal" : "italic",
                  }}
                >
                  {shift.siteAddress || "Pinned location"}
                </div>
                <Glyph name="chev-r" size={14} color={MC.hint} />
              </a>
            </div>
          )}

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
            {/* Pause/Resume toggle + Check-out actions side-by-side.
                One button does double duty (May 14, Gary): label +
                glyph + handler swap based on state. When on-break
                the same button reads "Resume" and flips state back
                to in-progress; otherwise it pauses. Check-out stays
                disabled while paused so the rep resumes before
                closing the shift (prevents "checked out while on
                break" weirdness in the audit trail). */}
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                type="button"
                onClick={async () => {
                  if (!shiftData) return;
                  const paused = shiftData.state === "on-break";
                  const r = await setShiftBreakState(shiftData.shiftId, !paused);
                  if (!r.ok) return;
                  void logEvent({
                    event_type: paused
                      ? "shift.break_ended"
                      : "shift.break_started",
                    shift_id: shiftData.shiftId,
                    customer_id: shiftData.customerId,
                    message: paused ? "Resumed shift" : "Paused shift",
                    meta: { kind: "open-ended" },
                  });
                  // Optimistic flip + the realtime subscribe on the
                  // useEffect will re-confirm with the DB shortly.
                  setShiftData((d) =>
                    d
                      ? { ...d, state: paused ? "in-progress" : "on-break" }
                      : d
                  );
                }}
                // Same shape as Check out — matches its padding,
                // radius, type. Differentiates via a translucent
                // white background instead of the brand fill on
                // pause; flips to brand fill when on-break to make
                // Resume read as the active CTA.
                style={{
                  background:
                    shiftData?.state === "on-break"
                      ? MC.brand
                      : "rgba(255,255,255,.14)",
                  color: "#fff",
                  border:
                    shiftData?.state === "on-break"
                      ? "none"
                      : "1px solid rgba(255,255,255,.18)",
                  padding: "12px 14px",
                  borderRadius: 12,
                  cursor: "pointer",
                  fontFamily: MC.font,
                  fontSize: 14,
                  fontWeight: 600,
                  letterSpacing: -0.1,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  appearance: "none",
                  WebkitAppearance: "none",
                  margin: 0,
                  boxShadow:
                    shiftData?.state === "on-break"
                      ? `0 6px 18px ${MC.brand}55`
                      : "none",
                }}
              >
                <Glyph
                  name={shiftData?.state === "on-break" ? "play" : "pause"}
                  size={15}
                  color="#fff"
                  strokeWidth={2.2}
                />
                {shiftData?.state === "on-break" ? "Resume" : "Pause"}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (shiftData?.state === "on-break") return;
                  const qs = completedTaskIds.length
                    ? `?completed=${completedTaskIds.join(",")}`
                    : "";
                  // Show the overlay BEFORE pushing — without this the
                  // rep sees a half-second dead frame between tapping
                  // and the check-out page mounting its own overlay.
                  setOpening({ customerName: shiftData?.name || "your shift" });
                  router.push(`/check-out${qs}`);
                }}
                disabled={shiftData?.state === "on-break"}
                title={
                  shiftData?.state === "on-break"
                    ? "Resume your shift first, then check out"
                    : undefined
                }
                style={{
                  background:
                    shiftData?.state === "on-break"
                      ? "rgba(255,255,255,.15)"
                      : MC.brand,
                  color: "#fff",
                  border: "none",
                  padding: "12px 16px",
                  borderRadius: 12,
                  cursor:
                    shiftData?.state === "on-break" ? "not-allowed" : "pointer",
                  fontFamily: MC.font,
                  fontSize: 14,
                  fontWeight: 600,
                  letterSpacing: -0.1,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  boxShadow:
                    shiftData?.state === "on-break"
                      ? "none"
                      : `0 6px 18px ${MC.brand}55`,
                  opacity: shiftData?.state === "on-break" ? 0.6 : 1,
                }}
              >
                Check out
                <Glyph name="leave" size={16} color="#fff" />
              </button>
            </div>
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

      {/* Geocode-task card (Feature B — May 13; relaxed May 14).
          Renders whenever the shift's site is missing coords. The
          rep can ALWAYS self-pin from here — we never want a "flag
          your manager" dead-end since the rep is the one standing
          at the place. setCustomerSiteCoords handles the
          siteId=null case by looking up the customer's primary site
          (or creating one) at submit time. */}
      {shiftData && (shiftData.siteLat === null || shiftData.siteLng === null) && (
        <div style={{ padding: "12px 16px 0" }}>
          <GeocodeTaskCard
            siteId={shiftData.siteId}
            customerId={shiftData.customerId}
            customerName={shiftData.name}
            // After a successful save the rep's site row has new
            // {latitude, longitude, name, address}. Refetch the
            // active shift from the DB so the dashboard's address
            // tile + map pin both update in one go — no manual
            // state stitching, no chance of fields drifting out
            // of sync.
            onResolved={async () => {
              const fresh = await getMyActiveShift();
              if (!fresh) return;
              setShiftData((d) =>
                d
                  ? {
                      ...d,
                      siteName: fresh.siteName,
                      siteAddress: fresh.siteAddress,
                      siteLat: fresh.siteLat,
                      siteLng: fresh.siteLng,
                    }
                  : d
              );
            }}
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
                  photosTaken={taskPhotoCounts.get(t.id) ?? 0}
                  signed={signedTaskIds.has(t.id)}
                  onClick={() => {
                    const isCompleted = completedTaskIds.includes(t.id);
                    const photoNeeded = t.photoCount ?? 0;
                    const taken = taskPhotoCounts.get(t.id) ?? 0;
                    const photosPending =
                      photoNeeded > 0 && taken < photoNeeded;
                    const sigPending =
                      t.requiresSignature && !signedTaskIds.has(t.id);
                    // Routing logic — first unfilled gate wins:
                    //   1. Photos still needed → camera flow
                    //   2. Signature still needed → signature pad
                    //   3. Otherwise → sheet (for description /
                    //      retake / view).
                    if (!isCompleted && photosPending) {
                      void startPhotoFlow(t);
                    } else if (!isCompleted && sigPending) {
                      void startSignatureFlow(t);
                    } else {
                      setOpenSheet({ task: t });
                    }
                  }}
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
                  photosTaken={taskPhotoCounts.get(t.id) ?? 0}
                  signed={signedTaskIds.has(t.id)}
                  onClick={() => {
                    const isCompleted = completedTaskIds.includes(t.id);
                    const photoNeeded = t.photoCount ?? 0;
                    const taken = taskPhotoCounts.get(t.id) ?? 0;
                    const photosPending =
                      photoNeeded > 0 && taken < photoNeeded;
                    const sigPending =
                      t.requiresSignature && !signedTaskIds.has(t.id);
                    // Routing logic — first unfilled gate wins:
                    //   1. Photos still needed → camera flow
                    //   2. Signature still needed → signature pad
                    //   3. Otherwise → sheet (for description /
                    //      retake / view).
                    if (!isCompleted && photosPending) {
                      void startPhotoFlow(t);
                    } else if (!isCompleted && sigPending) {
                      void startSignatureFlow(t);
                    } else {
                      setOpenSheet({ task: t });
                    }
                  }}
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

      {/* Page-level file input for the photo-flow (Feature C — May 13
          cleanup). One input that's re-used for every photo task;
          startPhotoFlow stashes which task / slot it's targeting,
          this onChange dispatches the upload + decides whether to
          chain to the next photo or mark the task complete.

          Single input vs one-per-slot makes the chain logic simpler
          and dodges the iOS-Safari quirk where multiple file inputs
          in close succession can confuse the OS picker. */}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => {
          const f = e.target.files?.[0];
          // ALWAYS clear so re-picking the same file fires onChange again.
          e.target.value = "";
          if (!f) return;
          void onPhotoCaptureFile(f);
        }}
        style={{ display: "none" }}
        aria-hidden="true"
        tabIndex={-1}
      />

      {/* Signature pad — Feature D. Mounted at page level (not
          inside the TaskSheet) for the same reason the photo input
          is here: the pad needs to overlay the whole screen and
          survive the rep tapping outside / cancelling. */}
      {signaturePad && shiftData && (
        <SignaturePad
          customerName={shiftData.name}
          taskName={signaturePad.task.name}
          initialDataUrl={signaturePad.initialDataUrl}
          initialSignerName={signaturePad.initialSignerName}
          saving={signaturePad.saving}
          error={signaturePad.error}
          onSave={handleSaveSignature}
          onCancel={() =>
            !signaturePad.saving && setSignaturePad(null)
          }
        />
      )}

      {/* Photo-flow overlay — three states share the same fixed-bottom
          card:
            1. uploading: spinner + "Uploading photo N of M…"
            2. error:    red border + retry button
            3. idle:     "Take photo N of M" button to fire the camera.
                         A button-tap is a fresh user gesture, which
                         iOS standalone PWA respects — without this,
                         after the first photo the auto-chain breaks
                         on iOS and the rep was stuck. */}
      {photoFlow && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: "fixed",
            bottom: "calc(86px + env(safe-area-inset-bottom, 0px))",
            left: 14,
            right: 14,
            zIndex: 55,
            // Background varies by state: dark while uploading
            // (clearly busy), white with brand accent when idle (ready
            // for next photo), white with danger accent on error.
            background: photoFlow.uploading ? MC.ink : "#fff",
            color: photoFlow.uploading ? "#fff" : MC.ink,
            border: photoFlow.uploading
              ? "none"
              : `1px solid ${photoFlow.error ? `${MC.danger}55` : `${MC.brand}55`}`,
            borderLeft: photoFlow.uploading
              ? "none"
              : `3px solid ${photoFlow.error ? MC.danger : MC.brand}`,
            borderRadius: 14,
            padding: "12px 14px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontFamily: MC.font,
            boxShadow: "0 12px 30px rgba(10,15,30,.25)",
          }}
        >
          {photoFlow.uploading ? (
            // ─── Uploading state ───────────────────────────────────
            <>
              <Spinner size={16} color="#fff" />
              <span style={{ fontSize: 13, fontWeight: 600 }}>
                Uploading photo {photoFlow.nextSlot + 1} of{" "}
                {photoFlow.totalSlots}…
              </span>
            </>
          ) : photoFlow.error ? (
            // ─── Error state ───────────────────────────────────────
            <>
              <Glyph
                name="warn"
                size={16}
                color={MC.danger}
                strokeWidth={2.4}
              />
              <span
                style={{ fontSize: 12.5, flex: 1, minWidth: 0, lineHeight: 1.35 }}
              >
                {photoFlow.error}
              </span>
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                style={{
                  background: MC.brandDeep,
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  padding: "6px 10px",
                  fontFamily: MC.font,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Retry
              </button>
              <button
                type="button"
                onClick={() => setPhotoFlow(null)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: MC.mute,
                  fontFamily: MC.font,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  padding: "6px 4px",
                }}
              >
                Cancel
              </button>
            </>
          ) : (
            // ─── Idle / ready-for-next-photo state ─────────────────
            //
            // Drives the per-photo "Take photo N of M" CTA. Critical
            // for iOS standalone PWA: after the first photo, the
            // auto-chained input.click() inside the upload-resolve
            // promise is treated as non-user-initiated by iOS and the
            // camera popup gets silently blocked. The button below is
            // a real DOM event handler → tapping it counts as a fresh
            // user gesture → camera opens cleanly. Same path works
            // identically on Android Chrome + desktop browsers.
            //
            // For photo 1 of N this branch normally isn't seen at all
            // because startPhotoFlow fires input.click() synchronously
            // inside the task-tap handler. It only renders if that
            // first auto-click failed (e.g. weird device) OR for
            // photos 2+ where we no longer auto-chain.
            <>
              <Glyph
                name="camera"
                size={16}
                color={MC.brandDeep}
                strokeWidth={2.4}
              />
              <span
                style={{
                  fontSize: 12.5,
                  flex: 1,
                  minWidth: 0,
                  lineHeight: 1.35,
                  fontWeight: 600,
                }}
              >
                {photoFlow.nextSlot === 0
                  ? "Ready to take your first photo"
                  : `${photoFlow.nextSlot} of ${photoFlow.totalSlots} done — ${photoFlow.totalSlots - photoFlow.nextSlot} to go`}
              </span>
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                style={{
                  background: MC.brandDeep,
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  padding: "8px 12px",
                  fontFamily: MC.font,
                  fontSize: 12.5,
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  boxShadow: `0 4px 10px ${MC.brand}44`,
                }}
              >
                <Glyph name="camera" size={13} color="#fff" strokeWidth={2.4} />
                Take photo {photoFlow.nextSlot + 1}
              </button>
              <button
                type="button"
                onClick={() => setPhotoFlow(null)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: MC.mute,
                  fontFamily: MC.font,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  padding: "6px 4px",
                }}
                aria-label="Close photo flow"
              >
                <Glyph name="close" size={14} color={MC.mute} />
              </button>
            </>
          )}
        </div>
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
  photosTaken,
  signed,
  onClick,
}: {
  task: Task;
  completed: boolean;
  active: boolean;
  /** For photo tasks: how many photos have been captured so far. */
  photosTaken: number;
  /** For signature tasks: whether a signature has been captured. */
  signed: boolean;
  onClick: () => void;
}) {
  const photoCount = task.photoCount ?? 0;
  const isPhotoTask = photoCount > 0;
  const needsSignature = !!task.requiresSignature;
  // For photo tasks, the row's primary visual cue is the camera pill.
  // The pill is brand-tinted when in-progress (some photos taken),
  // neutral when none yet, and green-checked when complete.
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
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginTop: 4,
            flexWrap: "wrap",
          }}
        >
          {task.duration != null && (
            <span
              style={{
                fontFamily: MC.font,
                fontSize: 12,
                color: MC.hint,
              }}
            >
              ~{task.duration} min{active ? " · in progress" : ""}
            </span>
          )}
          {isPhotoTask && (
            // Camera-required pill — makes the photo affordance
            // unmistakable. Tone changes with progress so the rep
            // can glance at the list and see what's left.
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "2px 8px 2px 6px",
                borderRadius: 999,
                fontFamily: MC.font,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 0.2,
                background: completed
                  ? `${MC.ok}1A`
                  : photosTaken > 0
                  ? MC.brandTint
                  : MC.warnTint,
                color: completed
                  ? "#0d6a45"
                  : photosTaken > 0
                  ? MC.brandDeep
                  : "#7A560A",
                border: `1px solid ${
                  completed
                    ? `${MC.ok}55`
                    : photosTaken > 0
                    ? `${MC.brand}33`
                    : `${MC.warn}55`
                }`,
              }}
            >
              <Glyph
                name="camera"
                size={11}
                color={
                  completed
                    ? "#0d6a45"
                    : photosTaken > 0
                    ? MC.brandDeep
                    : "#7A560A"
                }
                strokeWidth={2.4}
              />
              {completed
                ? `${photosTaken}/${photoCount} photos`
                : photosTaken === 0
                ? `Camera · ${photoCount} photo${photoCount === 1 ? "" : "s"}`
                : `${photosTaken}/${photoCount} photos`}
            </span>
          )}
          {needsSignature && (
            // Signature-required pill — mirror of the camera pill but
            // for Feature D's signature gate. Brand-tinted when not
            // yet signed (action needed), green when signed.
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "2px 8px 2px 6px",
                borderRadius: 999,
                fontFamily: MC.font,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 0.2,
                background: signed ? `${MC.ok}1A` : MC.brandTint,
                color: signed ? "#0d6a45" : MC.brandDeep,
                border: `1px solid ${signed ? `${MC.ok}55` : `${MC.brand}33`}`,
              }}
            >
              <Glyph
                name={signed ? "check" : "edit"}
                size={11}
                color={signed ? "#0d6a45" : MC.brandDeep}
                strokeWidth={2.4}
              />
              {signed ? "Signed" : "Signature"}
            </span>
          )}
        </div>
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

// ─── Geocode-task card (Feature B — May 13; reworked May 14) ──────
//
// Synthetic task that surfaces at the top of /active when the
// shift's customer_sites row is missing lat/lng. The rep enters a
// one-line site name (REQUIRED — "First aisle", "Loading bay",
// "Main entrance" etc) then taps "Pin this location" to drop a
// GPS pin. We force the name because otherwise the rep-created
// site stays labelled "Main" / "Head office" with no human-
// readable identifier anywhere downstream.
//
// May 14 reworked from two buttons (GPS + typed-address geocode)
// to one button (GPS only). The typed-address path was confusing
// to reps in the field; if the manager wants typed-address
// geocoding they have the full admin form. Mobile is GPS-only.
//
// On success: site row gets {latitude, longitude, name, address}
// updated (address is synthesised from the name so the dashboard
// stops saying "no address"), parent customer row gets the same
// (if it was missing coords), and the audit log gets a
// customer.geocoded event. Then the parent component refetches
// the active shift so the dashboard rerenders with the new
// location label.
function GeocodeTaskCard({
  siteId,
  customerId,
  customerName,
  onResolved,
}: {
  /** Null when the shift was scheduled against a customer that
   *  doesn't have a customer_sites row yet (legacy data, or a
   *  rep-created customer whose auto-site-creation missed). In
   *  that case setCustomerSiteCoords will look up or create a
   *  primary site for the customer at submit time. */
  siteId: string | null;
  customerId: string;
  customerName: string;
  /** Called after a successful save. Parent (/active) refetches
   *  the shift from the DB so siteName + siteAddress refresh
   *  on the dashboard — no manual state stitching here. */
  onResolved: () => void;
}) {
  const [name, setName] = useState<string>("");
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = name.trim();
  const canSubmit = !busy && trimmed.length > 0;

  const runGps = async () => {
    if (!trimmed) {
      setError("Add a name for this location first.");
      return;
    }
    setError(null);
    setBusy(true);
    const pos = await requestGeolocationOnce();
    if (!pos) {
      setBusy(false);
      setError(
        "Couldn't read your location. Allow location for Morpheus in browser settings, then try again."
      );
      return;
    }
    const r = await setCustomerSiteCoords({
      siteId,
      customerId,
      latitude: pos.lat,
      longitude: pos.lng,
      source: "gps",
      resolvedDescription: "Rep's device GPS",
      name: trimmed,
    });
    setBusy(false);
    if (!r.ok) {
      setError(r.error || "Couldn't save — try again.");
      return;
    }
    onResolved();
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
          Pin this location
        </div>
      </div>
      <div
        style={{
          fontFamily: MC.font,
          fontSize: 12.5,
          color: "#7A560A",
          lineHeight: 1.5,
          marginBottom: 12,
        }}
      >
        {customerName} doesn&apos;t have a pin yet. Give this location a
        name + tap below — your next check-in here will be geofenced
        + the manager will see it on the map.
      </div>
      {/* Required site name — disables the button until non-empty.
          Examples nudge the rep toward useful labels rather than
          generic "Main"/"Site 1" strings. */}
      <label
        htmlFor="geocode-site-name"
        style={{
          display: "block",
          fontFamily: MC.font,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 0.3,
          textTransform: "uppercase",
          color: "#7A560A",
          marginBottom: 6,
        }}
      >
        Site name <span style={{ color: "#9c1a3c" }}>*</span>
      </label>
      <input
        id="geocode-site-name"
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        disabled={busy}
        maxLength={60}
        placeholder="e.g. Main entrance, Cosmetics aisle, Loading bay"
        autoCapitalize="words"
        autoCorrect="off"
        style={{
          width: "100%",
          padding: "10px 12px",
          borderRadius: 10,
          border: `1px solid ${MC.warn}55`,
          background: "#fff",
          fontFamily: MC.font,
          fontSize: 13.5,
          color: MC.ink,
          outline: "none",
          boxSizing: "border-box",
          marginBottom: 12,
        }}
      />
      <button
        type="button"
        onClick={runGps}
        disabled={!canSubmit}
        style={{
          width: "100%",
          padding: "12px 14px",
          borderRadius: 10,
          background: canSubmit ? MC.brandDeep : `${MC.brandDeep}99`,
          color: "#fff",
          border: "none",
          cursor: busy ? "wait" : canSubmit ? "pointer" : "not-allowed",
          fontFamily: MC.font,
          fontSize: 13.5,
          fontWeight: 700,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          letterSpacing: -0.1,
          boxShadow: canSubmit ? `0 6px 18px ${MC.brand}55` : "none",
          opacity: busy ? 0.85 : 1,
        }}
      >
        <Glyph name="target" size={15} color="#fff" strokeWidth={2.4} />
        {busy ? "Pinning…" : "Geocode where I am"}
      </button>
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

  // One hidden <input type="file"> per slot. Keyed by slot index so
  // each tap on a slot triggers EXACTLY that slot's input. Using a
  // ref + programmatic .click() (instead of an absolute-positioned
  // input overlaid on a <label>) is the bullet-proof iOS/Android
  // pattern — the label-overlay approach silently no-opped on a
  // device in the field (May 13 bug report from Gary).
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const openPicker = (slotIndex: number) => {
    if (busySlot !== null) return;
    setSlotError(null);
    // Synchronous .click() inside the user-initiated tap handler — iOS
    // Safari only allows file pickers to open from a user gesture, and
    // this synchronous call inside onClick qualifies.
    inputRefs.current[slotIndex]?.click();
  };

  const handleFile = async (slotIndex: number, file: File) => {
    setSlotError(null);
    setBusySlot(slotIndex);
    try {
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
    } catch (err) {
      // Defensive catch — if compression or upload throws (not a
      // returned {ok:false}), surface the error to the rep instead
      // of leaving the slot stuck in busy state. Helps debug
      // intermittent device-side failures.
      setBusySlot(null);
      const msg = err instanceof Error ? err.message : "Upload crashed";
      setSlotError({ slot: slotIndex, msg });
      // eslint-disable-next-line no-console
      console.warn("[photos] handleFile threw:", err);
    }
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
                // Empty slot — REAL <button> with onClick that
                // programmatically clicks a hidden file input via
                // ref. This is the rock-solid file-picker pattern
                // that every battle-tested upload library uses
                // (react-dropzone, formik, etc) and works in:
                //
                //   - iOS Safari (regular + standalone PWA)
                //   - Android Chrome
                //   - Desktop browsers
                //
                // Why this beats the <label>-wrapping-input approach:
                //   - <button onClick> is a real, unambiguous tap
                //     target; iOS routes the tap correctly every time.
                //   - The synchronous .click() inside the user-gesture
                //     handler satisfies iOS Safari's "user activation"
                //     requirement for the file picker to open.
                //   - display:none on the input works for programmatic
                //     .click() (the no-no was for tap routing, which
                //     we no longer rely on).
                //
                // capture="environment" hints the rear camera; the rep
                // can still switch to the photo library from the OS
                // picker's overflow menu.
                <>
                  <input
                    ref={(el) => {
                      inputRefs.current[i] = el;
                    }}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      // Always clear the value so re-picking the same
                      // file fires onChange again. Must happen even
                      // when no file (rep cancelled the camera).
                      e.target.value = "";
                      if (!f) return;
                      if (isBusy) return;
                      void handleFile(i, f);
                    }}
                    style={{ display: "none" }}
                    aria-hidden="true"
                    tabIndex={-1}
                  />
                  <button
                    type="button"
                    onClick={() => openPicker(i)}
                    aria-label={`Take photo for slot ${i + 1}`}
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
                      padding: 0,
                      fontFamily: MC.font,
                    }}
                  >
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
                  </button>
                </>
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
