"use client";

/**
 * ShiftAssignmentWatcher — toast banner when a shift gets assigned
 * to the current rep. Two paths trigger it:
 *
 *   1. Admin creates a new shift with rep_id = me (manager scheduled
 *      something fresh for the rep).
 *   2. Admin reassigns an existing shift to me — the cancellation
 *      flow's "Reassign" button, or a series-edit / drag-drop that
 *      flips rep_id.
 *
 * Both manifest the same way on the rep's side: a shift row appears
 * with rep_id = my userId that wasn't there a moment ago. We tap
 * realtime postgres_changes on the shifts table, gate on "is this
 * the first time I've seen this shift_id?" via a localStorage
 * "seen" set, and toast a banner. The seen-set is also seeded on
 * mount from the rep's current shifts list so existing shifts don't
 * re-banner every cold start.
 *
 * Designed to mirror RequestResolutionWatcher in shape so both
 * watchers can co-exist at the layout level without surprises.
 */

import { useEffect, useRef, useState } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { listMyShiftsToday } from "@/lib/shifts-store";
import { MC } from "@/lib/tokens";
import { Glyph } from "@/components/Glyph";

const SEEN_LS_KEY = "morpheus.seen_shift_ids.v1";
const SEEN_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14d
const BANNER_AUTO_DISMISS_MS = 9000;

interface AssignmentBanner {
  id: string; // shift id
  customerName: string;
  shiftTime: string | null;
  isReassignment: boolean;
}

interface SeenStore {
  [shiftId: string]: number;
}

function readSeen(): SeenStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(SEEN_LS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SeenStore;
    // Drop stale entries — past completed shifts don't need to stay
    // in the set forever.
    const cutoff = Date.now() - SEEN_TTL_MS;
    const fresh: SeenStore = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (v > cutoff) fresh[k] = v;
    }
    return fresh;
  } catch {
    return {};
  }
}

function writeSeen(s: SeenStore) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SEEN_LS_KEY, JSON.stringify(s));
  } catch {
    /* quota / disabled */
  }
}

function formatShiftTime(start?: string | null, end?: string | null): string | null {
  if (!start || !end) return null;
  // Strip seconds if HH:MM:SS came back.
  return `${start.slice(0, 5)} – ${end.slice(0, 5)}`;
}

export function ShiftAssignmentWatcher() {
  const [banners, setBanners] = useState<AssignmentBanner[]>([]);
  const seenRef = useRef<SeenStore>({});
  const myUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured() || !supabase) return;

    let cancelled = false;
    seenRef.current = readSeen();

    const seedAndSubscribe = async () => {
      const { data: userData } = await supabase!.auth.getUser();
      if (cancelled) return;
      myUserIdRef.current = userData.user?.id ?? null;
      if (!myUserIdRef.current) return;

      // Seed seen-set with everything currently on the rep's plate
      // so a cold start doesn't toast every existing shift. Only
      // banners shifts that appear AFTER this snapshot.
      const myShifts = await listMyShiftsToday();
      if (cancelled) return;
      const now = Date.now();
      let dirty = false;
      for (const s of myShifts) {
        if (!seenRef.current[s.realId]) {
          seenRef.current[s.realId] = now;
          dirty = true;
        }
      }
      if (dirty) writeSeen(seenRef.current);
    };
    void seedAndSubscribe();

    // Tap realtime on the shifts table. We listen to BOTH INSERT
    // (admin creates a shift assigned to me) and UPDATE (admin
    // reassigns an existing shift to me — the cancellation flow's
    // Reassign button). The seen-set gate makes them equivalent
    // from our side: first time we see this id with rep_id = me,
    // that's the assignment.
    const channel = supabase
      .channel(`mobile_shift_assignments_${Date.now()}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "shifts" },
        (payload) => handleRow(payload.new as Record<string, unknown>, false)
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "shifts" },
        (payload) => handleRow(payload.new as Record<string, unknown>, true)
      )
      .subscribe();

    function handleRow(row: Record<string, unknown>, isUpdate: boolean) {
      const userId = myUserIdRef.current;
      if (!userId) return;
      const shiftId = typeof row.id === "string" ? row.id : null;
      const repId = typeof row.rep_id === "string" ? row.rep_id : null;
      if (!shiftId) return;
      // Only banner when it's MY row.
      if (repId !== userId) return;
      // Skip already-known shifts. This is the catch-all that prevents
      // every check-in / state flip / note save from re-banner-ing.
      if (seenRef.current[shiftId]) return;
      // Skip stale shifts (shift_date < today). Reassigning to me a
      // shift that already happened wouldn't make sense to celebrate.
      const shiftDate = typeof row.shift_date === "string" ? row.shift_date : null;
      if (shiftDate) {
        const today = new Date();
        const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
        if (shiftDate < todayISO) {
          // Still mark seen so we don't re-evaluate.
          seenRef.current[shiftId] = Date.now();
          writeSeen(seenRef.current);
          return;
        }
      }

      // Mark seen BEFORE pushing the banner so a racy double-event
      // (INSERT + UPDATE on the same row in quick succession) doesn't
      // double-toast.
      seenRef.current[shiftId] = Date.now();
      writeSeen(seenRef.current);

      const start = typeof row.start_time === "string" ? row.start_time : null;
      const end = typeof row.end_time === "string" ? row.end_time : null;
      const shiftTime = formatShiftTime(start, end);

      // We don't have the customer name on the row (only customer_id).
      // For v1, use the date as the headline; admin's audit log carries
      // the full context. Improvable later by joining customers in the
      // realtime payload — but Supabase doesn't support joined columns
      // in postgres_changes, so we'd need a follow-up fetch.
      const customerName = shiftDate
        ? new Date(shiftDate + "T00:00:00").toLocaleDateString(undefined, {
            weekday: "short",
            month: "short",
            day: "numeric",
          })
        : "New shift";

      setBanners((prev) => [
        ...prev,
        {
          id: shiftId,
          customerName,
          shiftTime,
          isReassignment: isUpdate,
        },
      ]);
    }

    return () => {
      cancelled = true;
      try {
        supabase!.removeChannel(channel);
      } catch {
        /* noop */
      }
    };
  }, []);

  // Auto-dismiss timer per-banner.
  useEffect(() => {
    if (banners.length === 0) return;
    const timers = banners.map((b) =>
      window.setTimeout(() => {
        setBanners((prev) => prev.filter((x) => x.id !== b.id));
      }, BANNER_AUTO_DISMISS_MS)
    );
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [banners]);

  const dismiss = (id: string) =>
    setBanners((prev) => prev.filter((b) => b.id !== id));

  if (banners.length === 0) return null;

  return (
    <>
      <div
        style={{
          position: "fixed",
          top: 60,
          left: 0,
          right: 0,
          zIndex: 50,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          padding: "0 14px",
          pointerEvents: "none",
        }}
      >
        {banners.map((b) => (
          <BannerCard key={b.id} banner={b} onDismiss={() => dismiss(b.id)} />
        ))}
      </div>
      <style>{`
        @keyframes saw-slide-in {
          0%   { transform: translateY(-12px); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }
        .saw-banner { animation: saw-slide-in .32s cubic-bezier(.22, 1, .36, 1) both; }
        @media (prefers-reduced-motion: reduce) {
          .saw-banner { animation: none !important; }
        }
      `}</style>
    </>
  );
}

function BannerCard({
  banner,
  onDismiss,
}: {
  banner: AssignmentBanner;
  onDismiss: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onDismiss}
      className="saw-banner"
      style={{
        pointerEvents: "auto",
        width: "100%",
        textAlign: "left",
        background: "#fff",
        border: `1px solid ${MC.brand}55`,
        borderLeft: `4px solid ${MC.brand}`,
        borderRadius: 12,
        padding: "10px 12px",
        boxShadow: "0 10px 24px rgba(10,15,30,.18)",
        display: "flex",
        alignItems: "center",
        gap: 10,
        cursor: "pointer",
        fontFamily: MC.font,
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: MC.brandTint,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Glyph
          name={banner.isReassignment ? "refresh" : "sparkle"}
          size={18}
          color={MC.brandDeep}
          strokeWidth={2.4}
        />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 11,
            color: MC.brandInk,
            fontWeight: 700,
            letterSpacing: 0.5,
            textTransform: "uppercase",
          }}
        >
          {banner.isReassignment ? "Shift reassigned to you" : "New shift assigned"}
        </div>
        <div
          style={{
            fontSize: 13.5,
            color: MC.ink,
            fontWeight: 600,
            marginTop: 2,
            letterSpacing: -0.1,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {banner.customerName}
          {banner.shiftTime ? ` · ${banner.shiftTime}` : ""}
        </div>
        <div
          style={{
            fontSize: 11.5,
            color: MC.mute,
            marginTop: 1,
          }}
        >
          Check Today&apos;s shifts for the details.
        </div>
      </div>
      <Glyph name="close" size={14} color={MC.mute} strokeWidth={2.2} />
    </button>
  );
}
