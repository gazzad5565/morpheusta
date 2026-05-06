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

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AC } from "@/lib/tokens";
import { Card } from "@/components/ui/Card";
import { AGlyph } from "@/components/ui/AGlyph";
import { Btn } from "@/components/ui/Btn";
import {
  listPendingRequests,
  deleteRequest,
  approveRequest,
  subscribeRequests,
  type PendingRequest,
} from "@/lib/requests-store";
import {
  listRecentEvents,
  subscribeEvents,
  EVENT_LABEL,
  eventTone,
  type ShiftEvent,
} from "@/lib/events-store";

type TabKey = "needs-action" | "all";

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

export function LiveFeedPanel() {
  const router = useRouter();
  // Default tab = "All activity" — the feed is the primary thing
  // managers want to see. The "Needs action" pill below already pulses
  // when there's something to deal with, so they won't miss it.
  const [activeTab, setActiveTab] = useState<TabKey>("all");

  // Pending requests (Needs action)
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const [requestsLoaded, setRequestsLoaded] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Activity (All activity)
  const [events, setEvents] = useState<ShiftEvent[]>([]);
  const [eventsLoaded, setEventsLoaded] = useState(false);

  // Tab-title alert: when there's something needing action, prefix the
  // browser tab title with "(N)" so the manager notices on a different
  // tab. Reverts to the original title when the count goes to zero.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const original = document.title.replace(/^\(\d+\)\s+/, "");
    if (requests.length > 0) {
      document.title = `(${requests.length}) ${original}`;
    } else {
      document.title = original;
    }
    return () => {
      // On unmount, leave the title clean.
      document.title = original;
    };
  }, [requests.length]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const rows = await listPendingRequests();
      if (cancelled) return;
      setRequests(rows);
      setRequestsLoaded(true);
    };
    load();
    const unsub = subscribeRequests(load);
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    listRecentEvents(50).then((rows) => {
      if (cancelled) return;
      setEvents(rows);
      setEventsLoaded(true);
    });
    // Realtime: prepend new events as they arrive. Dedup by id so a
    // race between the initial fetch and the realtime delivery can't
    // cause a duplicate row.
    const unsub = subscribeEvents((newEvent) => {
      setEvents((prev) => {
        if (prev.some((e) => e.id === newEvent.id)) return prev;
        return [newEvent, ...prev].slice(0, 50);
      });
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

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
      count: events.length,
    },
    {
      key: "needs-action",
      label: "Needs action",
      count: requests.length,
      alert: requests.length > 0,
    },
  ];

  return (
    <Card padding={0}>
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
          loaded={requestsLoaded}
          busyId={busyId}
          onSchedule={onSchedule}
          onApprove={onApprove}
          onDecline={onDecline}
        />
      )}
      {activeTab === "all" && <AllActivityList events={events} loaded={eventsLoaded} />}
    </Card>
  );
}

// ─── Needs action ──────────────────────────────────────────────────────

function NeedsActionList({
  requests,
  loaded,
  busyId,
  onSchedule,
  onApprove,
  onDecline,
}: {
  requests: PendingRequest[];
  loaded: boolean;
  busyId: string | null;
  onSchedule: (r: PendingRequest) => void;
  onApprove: (r: PendingRequest) => void;
  onDecline: (r: PendingRequest) => void;
}) {
  if (!loaded) {
    return (
      <div style={{ padding: 24, fontFamily: AC.font, fontSize: 12, color: AC.mute, textAlign: "center" }}>
        Loading…
      </div>
    );
  }
  if (requests.length === 0) {
    return (
      <div
        style={{
          padding: 28,
          textAlign: "center",
          background: "#fff",
        }}
      >
        <div style={{ fontFamily: AC.font, fontSize: 13, fontWeight: 600, color: AC.ink2 }}>
          All clear
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
          Nothing needs attention. Rep requests + flagged shifts will land here.
        </div>
      </div>
    );
  }
  return (
    <div style={{ padding: "8px 10px 10px", background: AC.brandSoft }}>
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
}: {
  events: ShiftEvent[];
  loaded: boolean;
}) {
  if (!loaded) {
    return (
      <div style={{ padding: 24, fontFamily: AC.font, fontSize: 12, color: AC.mute, textAlign: "center" }}>
        Loading…
      </div>
    );
  }
  if (events.length === 0) {
    return (
      <div
        style={{
          padding: 28,
          textAlign: "center",
          background: "#fff",
        }}
      >
        <div style={{ fontFamily: AC.font, fontSize: 13, fontWeight: 600, color: AC.ink2 }}>
          Quiet right now
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
          Check-ins, claims, schedules, requests, customer changes — they'll all stream
          here as they happen.
        </div>
      </div>
    );
  }
  return (
    <div style={{ padding: "10px 12px", maxHeight: 480, overflowY: "auto" }}>
      {events.map((e, i) => {
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
              borderBottom: i < events.length - 1 ? `1px solid ${AC.lineDim}` : "none",
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
  );
}
