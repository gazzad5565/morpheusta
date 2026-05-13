"use client";

/**
 * Live Feed — two tabs:
 *
 *   1. "Needs action" → pending rep-requested shifts. Each row has
 *      Schedule (→ /schedule/new pre-filled) + Decline. Subscribed to
 *      requested_shifts realtime so the badge + list flip live.
 *
 *   2. "All activity" → the shift_events log, newest first. Subscribed
 *      to shift_events INSERT so new rows appear at the top in real
 *      time.
 *
 * The previous "Needs action" placeholder + the separate "Requests" tab
 * were redundant — they're the same thing. Merged into one.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AC } from "@/lib/tokens";
import { Card } from "@/components/ui/Card";
import { AGlyph } from "@/components/ui/AGlyph";
import { Btn } from "@/components/ui/Btn";
import { Combobox } from "@/components/ui/Combobox";
import {
  listPendingRequests,
  deleteRequest,
  approveRequest,
  subscribeRequests,
  type PendingRequest,
} from "@/lib/requests-store";
import {
  listRecentEvents,
  countRecentEvents,
  subscribeEvents,
  EVENT_LABEL,
  eventTone,
  type ShiftEvent,
} from "@/lib/events-store";
import {
  listOpenAttentionShifts,
  listRepConflictsForSlot,
  reassignShift,
  releaseShift,
  acknowledgeAttention,
  cancelShiftFromAttention,
  subscribeShifts,
  type ShiftRow,
} from "@/lib/shifts-store";
import {
  listProfiles,
  displayName,
  type Profile,
} from "@/lib/profiles-store";

/**
 * Map the rep-supplied `attention_reason` enum to a human label.
 * Falls back to the raw value when an unknown reason somehow lands
 * (e.g. enum extended later on mobile, this client still on the
 * old build).
 */
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

/** Short "X min ago" / "Y hr ago" relative time. */
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

type TabKey = "needs-action" | "all";
type RangeKey = "today" | "7d" | "30d";

const RANGE_LABEL: Record<RangeKey, string> = {
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
};

// "All time" used to be an option but was removed: on a long-lived
// org the count climbs into the tens of thousands and the list query
// gets expensive without giving the manager actionable info. Three
// bounded windows (today / 7d / 30d) cover the realistic look-back
// for an ops console. If a true audit ever needs to span longer
// than 30 days, the events-store queries are still SQL-accessible.

/** ISO timestamp threshold for a given range — events with
 *  created_at >= threshold pass the filter. Always returns a real
 *  threshold; there is no "no filter" option anymore. */
function rangeStart(range: RangeKey): number {
  const now = new Date();
  if (range === "today") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return start.getTime();
  }
  const days = range === "7d" ? 7 : 30;
  return Date.now() - days * 24 * 60 * 60 * 1000;
}

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const days = Math.floor(h / 24);
  return `${days}d`;
}

/**
 * URL fragment used to deep-link directly to the Needs Action tab.
 *
 * Today's Shifts (the ShiftsList panel below the fold) renders a
 * "Needs action" filter that mixes pending requests + attention-
 * flagged shifts. Per product (May 13) clicking a row in THAT filter
 * shouldn't navigate to the shift detail — the manager already has
 * the inline approve/decline + reassign affordances in this panel,
 * so a row click there scrolls back up here and flips this tab on.
 *
 * Using a URL hash keeps the two panels decoupled (no event bus or
 * lifted state), it's deep-linkable, and the browser's native
 * fragment scrolling handles the scroll-into-view for free.
 */
export const LIVE_FEED_NEEDS_ACTION_HASH = "live-feed-needs-action";

export function LiveFeedPanel() {
  const router = useRouter();
  // Default tab = "All activity" — the feed is the primary thing
  // managers want to see. The "Needs action" pill below already pulses
  // when there's something to deal with, so they won't miss it.
  //
  // Override: if the page was loaded with a #live-feed-needs-action
  // hash (e.g. ShiftsList row click), start ON the Needs Action tab.
  // The hashchange listener below handles in-session jumps; this
  // initial-state branch handles first paint and full reloads.
  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    if (typeof window === "undefined") return "all";
    return window.location.hash === `#${LIVE_FEED_NEEDS_ACTION_HASH}`
      ? "needs-action"
      : "all";
  });
  // Date range for the All activity feed. Default = Today since the
  // event log grows quickly and "today's pulse" is what the manager
  // most often needs. The feed itself is capped to 50 most-recent
  // server-side, but the range filter is purely client-side now —
  // good enough until the log gets big enough to warrant pagination.
  const [range, setRange] = useState<RangeKey>("today");
  // Auto-flip back to All activity when Needs Action drops to empty.
  // Managers reported being left on a blank Needs Action tab after
  // the last item was resolved — the All-activity feed is the
  // primary thing they want to see, so we route them there.
  // Effect runs ONLY when needsActionCount changes so we don't fight
  // a manager who has deliberately switched back to a 0-count tab.
  // (Implemented further down where needsActionCount is in scope.)

  // Pending requests (Needs action)
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const [requestsLoaded, setRequestsLoaded] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Activity (All activity)
  const [events, setEvents] = useState<ShiftEvent[]>([]);
  const [eventsLoaded, setEventsLoaded] = useState(false);
  // Real total event count — what the "All activity" pill displays.
  // events.length was capped at 50 by listRecentEvents (display cap)
  // and managers were reading that as the actual number of events
  // for the day. The pill now shows the true count from a separate
  // HEAD query.
  const [eventsTotal, setEventsTotal] = useState<number>(0);

  // Unable-to-attend shifts (also in Needs action). Loaded separately
  // from requests because the underlying tables are different and
  // each has its own realtime channel.
  const [attentionShifts, setAttentionShifts] = useState<ShiftRow[]>([]);
  const [attentionLoaded, setAttentionLoaded] = useState(false);
  // Rep roster used by the Reassign picker. Loaded once on mount;
  // refreshed on visibilitychange so a newly-invited rep shows up
  // when the manager returns to the tab.
  const [reps, setReps] = useState<Profile[]>([]);

  // Tab-title alert + sidebar badge are handled in the Sidebar so they
  // work across every page, not just Live Ops. We don't duplicate the
  // logic here.

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const rows = await listPendingRequests();
      if (cancelled) return;
      setRequests(rows);
      setRequestsLoaded(true);
    };
    load();
    // Same defence-in-depth as the sidebar — realtime is the happy
    // path but websockets drop and there's a connect-window where
    // freshly-mounted channels can miss the first INSERT.
    const unsub = subscribeRequests(load);
    const onVis = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVis);
    const poll = window.setInterval(load, 60_000);
    return () => {
      cancelled = true;
      unsub();
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(poll);
    };
  }, []);

  // Attention queue + rep roster — load on mount, subscribe to any
  // shifts-table change (rep raises / withdraws / manager actions
  // from another tab) + visibility + 60s poll for the same reasons
  // the requests subscription has them.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [rows, profiles] = await Promise.all([
        listOpenAttentionShifts(),
        listProfiles({ role: "rep" }),
      ]);
      if (cancelled) return;
      setAttentionShifts(rows);
      setReps(profiles);
      setAttentionLoaded(true);
    };
    load();
    const unsub = subscribeShifts(load);
    const onVis = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVis);
    const poll = window.setInterval(load, 60_000);
    return () => {
      cancelled = true;
      unsub();
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(poll);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listRecentEvents(50), countRecentEvents()]).then(
      ([rows, total]) => {
        if (cancelled) return;
        setEvents(rows);
        setEventsTotal(total);
        setEventsLoaded(true);
      }
    );
    // Realtime: prepend new events as they arrive. Dedup by id so a
    // race between the initial fetch and the realtime delivery can't
    // cause a duplicate row. The display list still caps at 50 to
    // keep DOM cheap; the total counter bumps independently so the
    // pill stays accurate.
    const unsub = subscribeEvents((newEvent) => {
      setEvents((prev) => {
        if (prev.some((e) => e.id === newEvent.id)) return prev;
        return [newEvent, ...prev].slice(0, 50);
      });
      // The total is range-scoped (see effect below). Only bump it
      // here if the incoming event is within the current range —
      // otherwise we'd over-count by one whenever a stale event
      // arrived (e.g. an event from yesterday landing while range
      // is "Today").
      const newEventMs = new Date(newEvent.created_at).getTime();
      if (newEventMs >= rangeStart(range)) {
        setEventsTotal((n) => n + 1);
      }
    });
    return () => {
      cancelled = true;
      unsub();
    };
    // Realtime sub re-evaluates against the live `range` value, so
    // we need it in the dependency array.
  }, [range]);

  // Re-count whenever the range changes so the "All activity N" pill
  // tracks the dropdown. Previously the count was always all-time
  // and the dropdown only filtered the visible list — the pill said
  // 555 even when the list showed 12, which was misleading.
  useEffect(() => {
    let cancelled = false;
    const sinceIso = new Date(rangeStart(range)).toISOString();
    countRecentEvents({ since: sinceIso }).then((total) => {
      if (!cancelled) setEventsTotal(total);
    });
    return () => {
      cancelled = true;
    };
  }, [range]);

  // Schedule = open the form pre-filled, manager picks date/time/etc.
  const onSchedule = (r: PendingRequest) => {
    const qs = new URLSearchParams({
      rep: r.repId,
      customer: r.customerId,
      request: r.id,
    });
    router.push(`/schedule/new?${qs.toString()}`);
  };

  // Approve = one-tap, schedules today 08:00–17:00 to the requester.
  const onApprove = async (r: PendingRequest) => {
    if (
      !confirm(
        `Schedule ${r.customerName} for ${r.repName} today, 08:00–17:00?\n\nUse "Schedule" instead if you need to pick a different date or time.`
      )
    ) {
      return;
    }
    setBusyId(r.id);
    const result = await approveRequest(r.id);
    setBusyId(null);
    if (!result.ok) {
      alert(`Couldn't approve: ${result.error}`);
      return;
    }
    setRequests((rs) => rs.filter((x) => x.id !== r.id));
  };

  const onDecline = async (r: PendingRequest) => {
    if (!confirm(`Decline ${r.repName}'s request for ${r.customerName}?`)) return;
    setBusyId(r.id);
    const result = await deleteRequest(r.id, "declined");
    setBusyId(null);
    if (!result.ok) {
      alert(`Couldn't decline: ${result.error}`);
      return;
    }
    setRequests((rs) => rs.filter((x) => x.id !== r.id));
  };

  // ─── Attention (unable-to-attend) actions ───────────────────────────
  // Each handler optimistically removes the row from local state and
  // then trusts the realtime channel + 60s poll to keep things in
  // sync. If the DB call fails we re-fetch to roll back UI.

  const refetchAttention = async () => {
    const rows = await listOpenAttentionShifts();
    setAttentionShifts(rows);
  };

  const onReassign = async (shift: ShiftRow, newRepId: string) => {
    setBusyId(shift.id);
    const r = await reassignShift(shift.id, newRepId);
    setBusyId(null);
    if (!r.ok) {
      alert(`Couldn't reassign: ${r.error}`);
      await refetchAttention();
      return;
    }
    setAttentionShifts((rs) => rs.filter((x) => x.id !== shift.id));
  };

  const onRelease = async (shift: ShiftRow) => {
    const customerName = shift.customers?.name || "this shift";
    if (!confirm(`Release ${customerName} to the claimable pool? Any rep can pick it up.`)) {
      return;
    }
    setBusyId(shift.id);
    const r = await releaseShift(shift.id);
    setBusyId(null);
    if (!r.ok) {
      alert(`Couldn't release: ${r.error}`);
      await refetchAttention();
      return;
    }
    setAttentionShifts((rs) => rs.filter((x) => x.id !== shift.id));
  };

  const onAcknowledge = async (shift: ShiftRow) => {
    const customerName = shift.customers?.name || "this shift";
    if (
      !confirm(
        `Keep ${customerName} with the same rep?\n\nThey'll stay assigned and see a "Manager confirmed — you're still on this shift" message on their phone. Only use this if you've spoken to them and agreed they're still doing it.\n\nIf they're not doing the shift, use Reassign, Release, or Cancel instead.`
      )
    ) {
      return;
    }
    setBusyId(shift.id);
    const r = await acknowledgeAttention(shift.id);
    setBusyId(null);
    if (!r.ok) {
      alert(`Couldn't acknowledge: ${r.error}`);
      await refetchAttention();
      return;
    }
    setAttentionShifts((rs) => rs.filter((x) => x.id !== shift.id));
  };

  const onCancelShift = async (shift: ShiftRow) => {
    const customerName = shift.customers?.name || "this shift";
    if (
      !confirm(
        `Cancel ${customerName}? The shift will be marked cancelled; this can't be undone here (you'd need to recreate it).`
      )
    ) {
      return;
    }
    setBusyId(shift.id);
    const r = await cancelShiftFromAttention(shift.id);
    setBusyId(null);
    if (!r.ok) {
      alert(`Couldn't cancel: ${r.error}`);
      await refetchAttention();
      return;
    }
    setAttentionShifts((rs) => rs.filter((x) => x.id !== shift.id));
  };

  // Total open items across both flavours of "Needs action": rep
  // requests for a new shift + unable-to-attend overlays on existing
  // shifts. The pill counts both so a single number tells the manager
  // exactly how many things still want them.
  const needsActionCount = requests.length + attentionShifts.length;

  // Auto-flip Needs Action → All when nothing's pending. Tied to
  // needsActionCount so it only fires when the queue drains; a
  // manager sitting on the tab with 0 items WILL flip away, but
  // that's expected — when the queue's empty, the all-activity feed
  // is the more useful default.
  useEffect(() => {
    if (activeTab === "needs-action" && needsActionCount === 0) {
      setActiveTab("all");
    }
  }, [activeTab, needsActionCount]);

  // Hashchange handler: when ShiftsList sends the manager to
  // /#live-feed-needs-action (clicking a row in its "Needs action"
  // filter), flip THIS tab to Needs Action. The browser's native
  // fragment scrolling handles bringing the panel into view via
  // the matching id on the Card wrapper below.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onHashChange = () => {
      if (window.location.hash === `#${LIVE_FEED_NEEDS_ACTION_HASH}`) {
        setActiveTab("needs-action");
      }
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);
  const tabs: {
    key: TabKey;
    label: string;
    count: number;
    /** When true, the pill animates + uses a danger tint to draw the eye. */
    alert?: boolean;
  }[] = [
    {
      key: "all",
      label: "All activity",
      count: eventsTotal,
    },
    {
      key: "needs-action",
      label: "Needs action",
      count: needsActionCount,
      alert: needsActionCount > 0,
    },
  ];

  return (
    // Anchor id lets ShiftsList' "Needs action" filter deep-link a row
    // click into this panel — see LIVE_FEED_NEEDS_ACTION_HASH above.
    // scrollMarginTop reserves room for the sticky topbar so the panel
    // doesn't get tucked under the chrome when the browser scrolls to it.
    <Card padding={0}>
      <div
        id={LIVE_FEED_NEEDS_ACTION_HASH}
        style={{ scrollMarginTop: 80 }}
      >
      <div style={{ padding: "12px 14px 0", borderBottom: `1px solid ${AC.line}` }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 10,
          }}
        >
          <div
            style={{
              fontFamily: AC.font,
              fontSize: 13,
              fontWeight: 700,
              color: AC.ink,
              letterSpacing: -0.1,
            }}
          >
            Live feed
          </div>
          {/* Date range picker — moved up from above the activity
              list (it was duplicating the panel-header vertical
              space and shipped with a static-looking "50 events"
              count). Visible only on the All activity tab since
              Needs Action isn't time-filtered. */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {activeTab === "all" && (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span
                  style={{
                    fontFamily: AC.font,
                    fontSize: 10,
                    color: AC.mute,
                    fontWeight: 700,
                    letterSpacing: 0.4,
                    textTransform: "uppercase",
                  }}
                >
                  Show
                </span>
                <Combobox
                  value={range}
                  onChange={(v) => setRange((v ?? "today") as RangeKey)}
                  clearable={false}
                  triggerIcon={null}
                  searchable={false}
                  options={(Object.keys(RANGE_LABEL) as RangeKey[]).map((k) => ({
                    value: k,
                    label: RANGE_LABEL[k],
                  }))}
                />
              </div>
            )}
            <span
              style={{
                fontFamily: AC.font,
                fontSize: 10,
                fontWeight: 700,
                color: AC.ok,
                letterSpacing: 0.4,
                textTransform: "uppercase",
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 99,
                  background: AC.ok,
                }}
              />
              Live
            </span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {tabs.map((t) => {
            const active = activeTab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setActiveTab(t.key)}
                style={{
                  padding: "6px 10px",
                  borderRadius: "6px 6px 0 0",
                  background: "transparent",
                  border: "none",
                  borderBottom: active
                    ? `2px solid ${AC.ink}`
                    : `2px solid transparent`,
                  fontFamily: AC.font,
                  fontSize: 11.5,
                  fontWeight: 700,
                  color: t.alert ? AC.danger : active ? AC.ink : AC.mute,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  marginBottom: -1,
                }}
              >
                {t.label}
                <span
                  className={t.alert ? "lf-pulse" : undefined}
                  style={{
                    padding: "1px 6px",
                    borderRadius: 99,
                    fontSize: 10,
                    fontWeight: 700,
                    background: t.alert ? AC.danger : AC.bg,
                    color: t.alert ? "#fff" : AC.mute,
                  }}
                >
                  {t.count}
                </span>
              </button>
            );
          })}
        </div>
        {/* Pulse animation for the Needs-action tab pill when count > 0 */}
        <style>{`
          @keyframes lf-pulse-kf {
            0%   { box-shadow: 0 0 0 0   rgba(190, 24, 60, 0.55); }
            70%  { box-shadow: 0 0 0 6px rgba(190, 24, 60, 0);    }
            100% { box-shadow: 0 0 0 0   rgba(190, 24, 60, 0);    }
          }
          .lf-pulse { animation: lf-pulse-kf 1.4s ease-out infinite; }
        `}</style>
      </div>

      {activeTab === "needs-action" && (
        <NeedsActionList
          requests={requests}
          loaded={requestsLoaded && attentionLoaded}
          busyId={busyId}
          recentEvents={events}
          eventsLoaded={eventsLoaded}
          onSwitchToAll={() => setActiveTab("all")}
          onSchedule={onSchedule}
          onApprove={onApprove}
          onDecline={onDecline}
          attentionShifts={attentionShifts}
          reps={reps}
          onReassign={onReassign}
          onRelease={onRelease}
          onAcknowledge={onAcknowledge}
          onCancelShift={onCancelShift}
        />
      )}
      {activeTab === "all" && (
        <AllActivityList
          events={events}
          loaded={eventsLoaded}
          range={range}
        />
      )}
      </div>{/* end #live-feed-needs-action anchor wrapper */}
    </Card>
  );
}

// ─── Needs action ──────────────────────────────────────────────────────

function NeedsActionList({
  requests,
  loaded,
  busyId,
  recentEvents,
  eventsLoaded,
  onSwitchToAll,
  onSchedule,
  onApprove,
  onDecline,
  attentionShifts,
  reps,
  onReassign,
  onRelease,
  onAcknowledge,
  onCancelShift,
}: {
  requests: PendingRequest[];
  loaded: boolean;
  busyId: string | null;
  /** Last few events to show below "All clear" so the panel isn't
   *  empty when there's nothing actionable. */
  recentEvents: ShiftEvent[];
  eventsLoaded: boolean;
  onSwitchToAll: () => void;
  onSchedule: (r: PendingRequest) => void;
  onApprove: (r: PendingRequest) => void;
  onDecline: (r: PendingRequest) => void;
  /** Open unable-to-attend rows. Rendered ABOVE pending requests
   *  because someone's existing shift is more time-critical than
   *  someone wanting to add a new one. */
  attentionShifts: ShiftRow[];
  reps: Profile[];
  onReassign: (shift: ShiftRow, newRepId: string) => Promise<void>;
  onRelease: (shift: ShiftRow) => Promise<void>;
  onAcknowledge: (shift: ShiftRow) => Promise<void>;
  onCancelShift: (shift: ShiftRow) => Promise<void>;
}) {
  if (!loaded) {
    return (
      <div style={{ padding: 24, fontFamily: AC.font, fontSize: 12, color: AC.mute, textAlign: "center" }}>
        Loading…
      </div>
    );
  }
  // Empty inbox = no requests AND no attention rows. Either alone is
  // enough to surface the lists below.
  if (requests.length === 0 && attentionShifts.length === 0) {
    // Inbox-zero state: lead with a satisfying "all caught up" line,
    // then drop the 5 most recent activity events below so the
    // panel still has something useful to look at. Tap "View all"
    // to switch to the activity tab.
    const peek = recentEvents.slice(0, 5);
    return (
      <div style={{ background: "#fff" }}>
        <div style={{ padding: "24px 16px 12px", textAlign: "center" }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 999,
              background: AC.okTint,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 8,
            }}
          >
            <AGlyph name="check" size={20} color={AC.ok} />
          </div>
          <div style={{ fontFamily: AC.font, fontSize: 14, fontWeight: 700, color: AC.ink, letterSpacing: -0.1 }}>
            All caught up
          </div>
          <div
            style={{
              fontFamily: AC.font,
              fontSize: 11.5,
              color: AC.mute,
              marginTop: 4,
              lineHeight: 1.5,
            }}
          >
            Rep requests will land here as they come in.
          </div>
        </div>
        {eventsLoaded && peek.length > 0 && (
          <div style={{ borderTop: `1px solid ${AC.lineDim}` }}>
            <div
              style={{
                padding: "10px 14px 4px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontFamily: AC.font,
                fontSize: 10.5,
                fontWeight: 700,
                color: AC.mute,
                letterSpacing: 0.4,
                textTransform: "uppercase",
              }}
            >
              <span>Recent activity</span>
              <button
                type="button"
                onClick={onSwitchToAll}
                style={{
                  background: "transparent",
                  border: "none",
                  color: AC.brandDeep,
                  cursor: "pointer",
                  fontFamily: AC.font,
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: 0.4,
                  textTransform: "uppercase",
                }}
              >
                View all →
              </button>
            </div>
            <div style={{ padding: "0 12px 10px" }}>
              {peek.map((e, i) => {
                const tone = eventTone(e.event_type);
                const accent =
                  tone === "ok"
                    ? AC.ok
                    : tone === "warn"
                    ? AC.warn
                    : tone === "danger"
                    ? AC.danger
                    : AC.brand;
                return (
                  <div
                    key={e.id}
                    style={{
                      padding: "7px 10px",
                      borderBottom:
                        i < peek.length - 1 ? `1px solid ${AC.lineDim}` : "none",
                      borderLeft: `2px solid ${accent}`,
                      paddingLeft: 10,
                      marginLeft: -2,
                    }}
                  >
                    <div
                      style={{
                        fontFamily: AC.font,
                        fontSize: 11.5,
                        color: AC.ink,
                        lineHeight: 1.4,
                      }}
                    >
                      <b style={{ fontWeight: 700 }}>{e.actor_label || "System"}</b>{" "}
                      <span style={{ color: AC.mute }}>
                        {EVENT_LABEL[e.event_type] || e.event_type}
                      </span>
                      {e.message && (
                        <>
                          {" — "}
                          <span style={{ color: AC.ink2 }}>{e.message}</span>
                        </>
                      )}
                    </div>
                    <div
                      style={{
                        fontFamily: AC.fontMono,
                        fontSize: 10,
                        color: AC.hint,
                        marginTop: 1,
                        fontWeight: 600,
                      }}
                    >
                      {formatRelative(e.created_at)} ago
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }
  return (
    <div style={{ padding: "8px 10px 10px", background: AC.brandSoft }}>
      {/* Attention rows first — someone with an existing shift who
          can't make it is more time-critical than a rep wanting to
          add a new one. Each row carries its own four-button
          resolution strip. */}
      {attentionShifts.length > 0 && (
        <div style={{ marginBottom: requests.length > 0 ? 10 : 0 }}>
          <SectionHeader
            label={`Can't make it (${attentionShifts.length})`}
            tone="warn"
          />
          {attentionShifts.map((s) => (
            <AttentionRow
              key={s.id}
              shift={s}
              reps={reps}
              busy={busyId === s.id}
              onReassign={onReassign}
              onRelease={onRelease}
              onAcknowledge={onAcknowledge}
              onCancelShift={onCancelShift}
            />
          ))}
        </div>
      )}

      {requests.length > 0 && attentionShifts.length > 0 && (
        <SectionHeader label={`Rep requests (${requests.length})`} tone="info" />
      )}

      {requests.map((r, i) => (
        <div
          key={r.id}
          style={{
            padding: 10,
            marginBottom: i === requests.length - 1 ? 0 : 6,
            background: "#fff",
            border: `1px solid ${AC.line}`,
            borderLeft: `3px solid ${AC.brand}`,
            borderRadius: 8,
            display: "flex",
            gap: 10,
            alignItems: "flex-start",
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              background: r.customerColor,
              color: "#fff",
              fontFamily: AC.font,
              fontSize: 10.5,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {r.customerInitials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginBottom: 3,
                flexWrap: "wrap",
                lineHeight: 1.15,
              }}
            >
              <span
                style={{
                  fontFamily: AC.font,
                  fontSize: 12.5,
                  fontWeight: 700,
                  color: AC.ink,
                  letterSpacing: -0.1,
                }}
              >
                {r.repName}
              </span>
              <span
                style={{
                  padding: "2px 6px",
                  borderRadius: 99,
                  background: AC.brandTint,
                  color: AC.brandDeep,
                  fontFamily: AC.font,
                  fontSize: 9.5,
                  fontWeight: 700,
                  letterSpacing: 0.4,
                  textTransform: "uppercase",
                  lineHeight: 1.2,
                }}
              >
                Request
              </span>
              <div style={{ flex: 1 }} />
              <span
                style={{
                  fontFamily: AC.fontMono,
                  fontSize: 10.5,
                  color: AC.hint,
                  fontWeight: 600,
                }}
              >
                {formatRelative(r.requestedAt)}
              </span>
            </div>
            <div
              style={{
                fontFamily: AC.font,
                fontSize: 11.5,
                color: AC.ink2,
                lineHeight: 1.45,
                fontWeight: 500,
              }}
            >
              Wants to work <b style={{ color: AC.ink }}>{r.customerName}</b> · #{r.customerCode}
            </div>
            <div style={{ display: "flex", gap: 5, marginTop: 7, flexWrap: "wrap" }}>
              <Btn
                size="sm"
                kind="primary"
                icon="check"
                onClick={() => onApprove(r)}
                disabled={busyId === r.id}
                title="Schedule today 08:00–17:00 for this rep — one tap"
              >
                Approve
              </Btn>
              <Btn
                size="sm"
                icon="cal"
                onClick={() => onSchedule(r)}
                disabled={busyId === r.id}
                title="Open the schedule form to pick a date / time / different rep"
              >
                Schedule…
              </Btn>
              <Btn
                size="sm"
                icon="x"
                onClick={() => onDecline(r)}
                disabled={busyId === r.id}
              >
                Decline
              </Btn>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── All activity ──────────────────────────────────────────────────────

function AllActivityList({
  events,
  loaded,
  range,
}: {
  events: ShiftEvent[];
  loaded: boolean;
  range: RangeKey;
}) {
  // Apply the date filter client-side. The events array is already
  // capped to 50 server-side; once the log gets bigger this branches
  // into a server-side window with cursoring. rangeStart() always
  // returns a real threshold now that the "All time" option is
  // gone.
  const startMs = rangeStart(range);
  const filtered = events.filter(
    (e) => new Date(e.created_at).getTime() >= startMs
  );

  // The "Show today" picker that used to live here moved up to the
  // panel header (see LiveFeedPanel render). The "50 events" count
  // that lived next to it was misleading because it was almost
  // always pinned at the server-side display cap of 50 — managers
  // were reading it as a static label. Removed.
  if (!loaded) {
    return (
      <div style={{ padding: 24, fontFamily: AC.font, fontSize: 12, color: AC.mute, textAlign: "center" }}>
        Loading…
      </div>
    );
  }
  if (filtered.length === 0) {
    return (
      <>
        <div
          style={{
            padding: 28,
            textAlign: "center",
            background: "#fff",
          }}
        >
          <div style={{ fontFamily: AC.font, fontSize: 13, fontWeight: 600, color: AC.ink2 }}>
            Nothing in this window
          </div>
          <div
            style={{
              fontFamily: AC.font,
              fontSize: 11.5,
              color: AC.mute,
              marginTop: 6,
              lineHeight: 1.5,
            }}
          >
            Try a wider range — check-ins, claims, schedules, requests, customer
            changes all stream here.
          </div>
        </div>
      </>
    );
  }
  return (
    <>
      <div style={{ padding: "10px 12px", maxHeight: 480, overflowY: "auto" }}>
        {filtered.map((e, i) => {
        const tone = eventTone(e.event_type);
        const accent =
          tone === "ok"
            ? AC.ok
            : tone === "warn"
            ? AC.warn
            : tone === "danger"
            ? AC.danger
            : AC.brand;
        return (
          <div
            key={e.id}
            style={{
              padding: "8px 10px",
              borderBottom: i < filtered.length - 1 ? `1px solid ${AC.lineDim}` : "none",
              borderLeft: `3px solid ${accent}`,
              marginLeft: -4,
              paddingLeft: 11,
              display: "flex",
              gap: 10,
              alignItems: "flex-start",
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontFamily: AC.font,
                  fontSize: 12,
                  color: AC.ink,
                  fontWeight: 500,
                  lineHeight: 1.4,
                }}
              >
                <b style={{ fontWeight: 700 }}>{e.actor_label || "System"}</b>{" "}
                <span style={{ color: AC.mute }}>{EVENT_LABEL[e.event_type] || e.event_type}</span>
                {e.message && (
                  <>
                    {" — "}
                    <span style={{ color: AC.ink2 }}>{e.message}</span>
                  </>
                )}
              </div>
              <div
                style={{
                  fontFamily: AC.fontMono,
                  fontSize: 10.5,
                  color: AC.hint,
                  marginTop: 2,
                  fontWeight: 600,
                }}
              >
                {formatRelative(e.created_at)} ago
              </div>
            </div>
          </div>
        );
      })}
      </div>
    </>
  );
}

// ─── Attention row (unable-to-attend) ─────────────────────────────────

function SectionHeader({
  label,
  tone,
}: {
  label: string;
  tone: "warn" | "info";
}) {
  const color = tone === "warn" ? "#7d5708" : AC.brandDeep;
  return (
    <div
      style={{
        fontFamily: AC.font,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 0.5,
        textTransform: "uppercase",
        color,
        padding: "4px 4px 6px",
      }}
    >
      {label}
    </div>
  );
}

function AttentionRow({
  shift,
  reps,
  busy,
  onReassign,
  onRelease,
  onAcknowledge,
  onCancelShift,
}: {
  shift: ShiftRow;
  reps: Profile[];
  busy: boolean;
  onReassign: (shift: ShiftRow, newRepId: string) => Promise<void>;
  onRelease: (shift: ShiftRow) => Promise<void>;
  onAcknowledge: (shift: ShiftRow) => Promise<void>;
  onCancelShift: (shift: ShiftRow) => Promise<void>;
}) {
  // Inline rep picker — collapsed by default; "Reassign" toggles it.
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickedRepId, setPickedRepId] = useState<string | null>(null);
  // Reps already booked into a shift that overlaps this slot —
  // loaded the moment the picker opens so we can warn the manager
  // before they double-book someone. Empty until first load.
  const [conflictRepIds, setConflictRepIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!pickerOpen) return;
    let cancelled = false;
    listRepConflictsForSlot({
      shiftDate: shift.shift_date,
      startTime: shift.start_time,
      endTime: shift.end_time,
      excludeShiftId: shift.id,
    }).then((s) => {
      if (!cancelled) setConflictRepIds(s);
    });
    return () => {
      cancelled = true;
    };
  }, [pickerOpen, shift.id, shift.shift_date, shift.start_time, shift.end_time]);

  const customer = shift.customers;
  const site = shift.site;
  const showSite = site && site.name && site.name !== "Head office";
  const originalRep = reps.find((r) => r.id === shift.rep_id);
  const originalRepLabel = originalRep
    ? displayName(originalRep)
    : shift.rep_id
    ? "Unknown rep"
    : "Unassigned";
  const pickedHasConflict = !!pickedRepId && conflictRepIds.has(pickedRepId);

  const handleReassignConfirm = async () => {
    if (!pickedRepId) return;
    // Double-book guard — the picker already shows a "Conflict" tag
    // next to the option, but we hard-confirm at submit time too in
    // case the manager picked it anyway.
    if (pickedHasConflict) {
      const repName =
        reps.find((r) => r.id === pickedRepId)?.name ||
        reps.find((r) => r.id === pickedRepId)?.email ||
        "this rep";
      if (
        !confirm(
          `${repName} already has a shift in that time slot. Reassign anyway and double-book them?`
        )
      ) {
        return;
      }
    }
    await onReassign(shift, pickedRepId);
    // Sheet stays open visually only until the realtime/refetch
    // removes the row from local state, but resetting is cheap.
    setPickerOpen(false);
    setPickedRepId(null);
  };

  return (
    <div
      style={{
        padding: 10,
        marginBottom: 6,
        background: "#fff",
        border: `1px solid ${AC.warn}55`,
        borderLeft: `3px solid ${AC.warn}`,
        borderRadius: 8,
      }}
    >
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 7,
            background: customer?.color || AC.mute,
            color: "#fff",
            fontFamily: AC.font,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 0.4,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {customer?.initials || "??"}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: AC.font,
              fontSize: 13,
              fontWeight: 700,
              color: AC.ink,
              letterSpacing: -0.1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {customer?.name || "Unknown customer"}
            {showSite && (
              <span style={{ color: AC.mute, fontWeight: 500 }}>
                {" · "}
                {site!.name}
              </span>
            )}
          </div>
          <div
            style={{
              fontFamily: AC.font,
              fontSize: 11.5,
              color: AC.mute,
              marginTop: 2,
              display: "flex",
              alignItems: "center",
              gap: 6,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                textDecoration: "line-through",
                textDecorationColor: AC.danger,
              }}
            >
              {originalRepLabel}
            </span>
            <span
              style={{
                padding: "1px 6px",
                borderRadius: 99,
                background: AC.warnTint,
                color: "#7d5708",
                fontWeight: 700,
                fontSize: 10.5,
                letterSpacing: 0.3,
                textTransform: "uppercase",
              }}
            >
              {attentionReasonLabel(shift.attention_reason)}
            </span>
            <span>
              {shift.shift_date} · {shift.start_time?.slice(0, 5)}–
              {shift.end_time?.slice(0, 5)}
            </span>
            <span style={{ color: AC.hint }}>
              · raised {relativeAgo(shift.attention_raised_at)}
            </span>
          </div>
          {shift.attention_note && (
            <div
              style={{
                marginTop: 6,
                padding: "6px 8px",
                background: AC.warnTint,
                borderRadius: 6,
                fontFamily: AC.font,
                fontSize: 11.5,
                color: "#6d4808",
                lineHeight: 1.4,
                whiteSpace: "pre-wrap",
              }}
            >
              “{shift.attention_note}”
            </div>
          )}
        </div>
      </div>

      {/* Inline rep picker (only shown after "Reassign" is tapped). */}
      {pickerOpen && (
        <div
          style={{
            marginTop: 8,
            padding: 8,
            background: AC.bg,
            borderRadius: 8,
            display: "flex",
            gap: 6,
            alignItems: "center",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <Combobox
              value={pickedRepId}
              onChange={(v) => setPickedRepId(v)}
              triggerIcon="reps"
              placeholder="Pick a rep…"
              clearable={false}
              options={reps
                .filter((r) => r.id !== shift.rep_id)
                .map((r) => {
                  const hasConflict = conflictRepIds.has(r.id);
                  return {
                    value: r.id,
                    label: displayName(r),
                    sublabel: hasConflict
                      ? `⚠ Conflict · already booked at this time`
                      : r.email,
                    color: hasConflict ? AC.danger : undefined,
                  };
                })}
            />
            {pickedHasConflict && (
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
                This rep already has an overlapping shift. You can still
                reassign — you'll be asked to confirm a double-book.
              </div>
            )}
          </div>
          <Btn
            size="sm"
            kind="primary"
            icon="check"
            disabled={busy || !pickedRepId}
            onClick={handleReassignConfirm}
          >
            Reassign
          </Btn>
          <Btn
            size="sm"
            onClick={() => {
              setPickerOpen(false);
              setPickedRepId(null);
            }}
            disabled={busy}
          >
            Cancel
          </Btn>
        </div>
      )}

      {/* Action row. Reassign is primary; the rest are secondary. */}
      {!pickerOpen && (
        <div
          style={{
            marginTop: 8,
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
          }}
        >
          <Btn
            size="sm"
            kind="primary"
            icon="reps"
            onClick={() => setPickerOpen(true)}
            disabled={busy}
          >
            Reassign
          </Btn>
          <Btn
            size="sm"
            icon="send"
            onClick={() => onRelease(shift)}
            disabled={busy}
          >
            Release
          </Btn>
          <Btn
            size="sm"
            icon="check"
            onClick={() => onAcknowledge(shift)}
            disabled={busy}
            title="Keep the rep on this shift. They'll see a confirmation on their phone."
          >
            Keep · rep stays on
          </Btn>
          <Btn
            size="sm"
            kind="danger"
            icon="x"
            onClick={() => onCancelShift(shift)}
            disabled={busy}
          >
            Cancel shift
          </Btn>
          {/* Escape hatch — full edit form when none of the canned
              resolutions fit (eg manager wants to change date/time
              or move to a different customer). The shift edit page
              doesn't auto-clear the flag, so the banner persists
              until they action it. */}
          <Link
            href={`/shifts/${shift.id}/edit`}
            style={{ textDecoration: "none" }}
          >
            <Btn size="sm" icon="edit" disabled={busy}>
              Edit…
            </Btn>
          </Link>
        </div>
      )}
    </div>
  );
}
