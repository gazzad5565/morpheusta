"use client";

/**
 * RequestResolutionWatcher — toast-style banners when a rep's pending
 * request is approved or declined.
 *
 * Mount once at the layout level; it lives quietly and renders nothing
 * unless something just resolved. Two surfaces:
 *
 *   1. The OLD requested_shifts card disappears on approval (already
 *      handled by the existing realtime sub on /shifts).
 *   2. The NEW shift appears on the rep's Today list (handled by
 *      subscribeShifts on /shifts + dashboard).
 *
 * Without this component, both #1 and #2 happen silently — no closure
 * for the rep. This bridges the gap by tapping the shift_events log:
 * when admin fires "request.scheduled" or "request.declined" for a
 * customer the rep recently had pending, we surface a banner.
 *
 * Design choices:
 *   - Tracked-customers set is built from listRequestedShifts() on
 *     mount + grows on requested_shifts INSERTs. So if a rep submits,
 *     closes the app, comes back, and admin then approves — we still
 *     catch it because we re-listed pending on remount.
 *   - 5-minute "recently pending" grace window so the resolution
 *     event still finds the customer even though the requested_shifts
 *     row was deleted just before.
 *   - localStorage tracks "seen" event ids so a banner can't
 *     re-appear after the rep dismissed it. Cleared after 24h to
 *     stop the set from growing forever.
 *   - actor_id !== current rep — so the rep never gets a banner from
 *     their own action.
 */

import { useEffect, useState, useRef } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { listRequestedShifts } from "@/lib/shift-store";
import { MC } from "@/lib/tokens";
import { Glyph } from "@/components/Glyph";

const SEEN_LS_KEY = "morpheus.seen_resolution_events.v1";
const SEEN_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const RECENT_GRACE_MS = 5 * 60 * 1000; // 5 min after pending row deletes
const BANNER_AUTO_DISMISS_MS = 8000;

interface ResolutionBanner {
  id: string; // event id
  kind: "approved" | "declined";
  customerName: string;
  message: string;
  ts: number;
}

interface SeenStore {
  [eventId: string]: number; // timestamp seen
}

function readSeen(): SeenStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(SEEN_LS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SeenStore;
    // GC stale entries while we're here.
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

export function RequestResolutionWatcher() {
  const [banners, setBanners] = useState<ResolutionBanner[]>([]);
  // customer_id → last-seen-pending timestamp (used as "is recent" check)
  const trackedRef = useRef<Map<string, number>>(new Map());
  const seenRef = useRef<SeenStore>({});
  // Cache user id once so the realtime callback doesn't have to hit
  // supabase.auth.getUser() on every event.
  const myUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured() || !supabase) return;

    let cancelled = false;
    seenRef.current = readSeen();

    const init = async () => {
      const { data: userData } = await supabase!.auth.getUser();
      if (cancelled) return;
      myUserIdRef.current = userData.user?.id ?? null;
      if (!myUserIdRef.current) return;

      // Seed the tracked-customers map with anything currently pending
      // for this rep. listRequestedShifts already filters by RLS so we
      // only see our own rows.
      const rows = await listRequestedShifts();
      if (cancelled) return;
      const now = Date.now();
      for (const r of rows) trackedRef.current.set(r.id, now);
    };
    void init();

    // Track new request submissions so the resolution event later finds
    // the customer in our map even if pending was empty at mount time.
    const reqChannel = supabase
      .channel(`mobile_resolution_requests_${Date.now()}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "requested_shifts" },
        (payload) => {
          const row = payload.new as { customer_id?: string; rep_id?: string };
          if (!row.customer_id) return;
          // Only track our own rows.
          if (row.rep_id && myUserIdRef.current && row.rep_id !== myUserIdRef.current) {
            return;
          }
          trackedRef.current.set(row.customer_id, Date.now());
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "requested_shifts" },
        (payload) => {
          // Stamp the customer id with "recently deleted" — keeps it
          // visible to the resolution event check for RECENT_GRACE_MS.
          const row = payload.old as { customer_id?: string };
          if (!row.customer_id) return;
          trackedRef.current.set(row.customer_id, Date.now());
        }
      )
      .subscribe();

    // Listen for the resolution events themselves.
    const evtChannel = supabase
      .channel(`mobile_resolution_events_${Date.now()}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "shift_events" },
        (payload) => {
          const evt = payload.new as {
            id?: string;
            event_type?: string;
            actor_id?: string | null;
            customer_id?: string | null;
            message?: string | null;
          };
          if (!evt.id || !evt.event_type) return;
          if (
            evt.event_type !== "request.scheduled" &&
            evt.event_type !== "request.declined"
          ) {
            return;
          }
          // Skip our own actions (defensive — the rep wouldn't normally
          // trigger these but if they did we don't want to toast them).
          if (
            evt.actor_id &&
            myUserIdRef.current &&
            evt.actor_id === myUserIdRef.current
          ) {
            return;
          }
          // Already shown / dismissed? Skip.
          if (seenRef.current[evt.id]) return;
          // Was this for a customer we ever had pending in this session?
          //
          // The earlier 5-minute grace gate was the wrong model: if an
          // admin took longer than five minutes to approve, the
          // banner stopped firing because the trackedRef stamp from
          // app-mount had aged out. That made the "I just got
          // approved!" payoff disappear for any request that wasn't
          // resolved instantly.
          //
          // We just need "is this one of MY requests?" — trackedRef
          // is in-memory + bounded by the customers a rep ever asked
          // for in this session, so leaving entries forever is fine.
          if (!evt.customer_id) return;
          if (!trackedRef.current.has(evt.customer_id)) return;

          // Mark as seen immediately so a duplicate INSERT (very rare)
          // doesn't double-toast.
          seenRef.current[evt.id] = Date.now();
          writeSeen(seenRef.current);

          // Pull customer name out of the message ("Approved request
          // for X" / "Declined request for X"). Falls back to a
          // generic label if parsing fails.
          const customerName =
            evt.message?.replace(/^(Approved|Declined) request for /i, "")?.trim() ||
            "your request";

          setBanners((prev) => [
            ...prev,
            {
              id: evt.id!,
              kind: evt.event_type === "request.scheduled" ? "approved" : "declined",
              customerName,
              message: evt.message || "",
              ts: Date.now(),
            },
          ]);

          // Drop from tracked since it's been resolved.
          trackedRef.current.delete(evt.customer_id);
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      try {
        supabase!.removeChannel(reqChannel);
        supabase!.removeChannel(evtChannel);
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
      {/* Stack at top, below status bar / app header. position:fixed
          relative to the phone-frame so it stays put while content
          scrolls. */}
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
        @keyframes rrw-slide-in {
          0%   { transform: translateY(-12px); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }
        .rrw-banner { animation: rrw-slide-in .32s cubic-bezier(.22, 1, .36, 1) both; }
        @media (prefers-reduced-motion: reduce) {
          .rrw-banner { animation: none !important; }
        }
      `}</style>
    </>
  );
}

function BannerCard({
  banner,
  onDismiss,
}: {
  banner: ResolutionBanner;
  onDismiss: () => void;
}) {
  const isApproved = banner.kind === "approved";
  const accent = isApproved ? MC.ok : MC.danger;
  const tint = isApproved ? MC.okTint : MC.dangerTint;
  const ink = isApproved ? "#0d6a45" : "#9c1a3c";
  return (
    <button
      type="button"
      onClick={onDismiss}
      className="rrw-banner"
      style={{
        pointerEvents: "auto",
        width: "100%",
        textAlign: "left",
        background: "#fff",
        border: `1px solid ${accent}55`,
        borderLeft: `4px solid ${accent}`,
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
          background: tint,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Glyph
          name={isApproved ? "check-circle" : "close"}
          size={18}
          color={accent}
          strokeWidth={2.4}
        />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 11,
            color: ink,
            fontWeight: 700,
            letterSpacing: 0.5,
            textTransform: "uppercase",
          }}
        >
          {isApproved ? "Request approved" : "Request declined"}
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
        </div>
        <div
          style={{
            fontSize: 11.5,
            color: MC.mute,
            marginTop: 1,
          }}
        >
          {isApproved
            ? "Your shift is in Today's list."
            : "You can request again anytime."}
        </div>
      </div>
      <Glyph name="close" size={14} color={MC.mute} strokeWidth={2.2} />
    </button>
  );
}
