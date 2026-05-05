"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AC } from "@/lib/tokens";
import { Card } from "@/components/ui/Card";
import { AGlyph } from "@/components/ui/AGlyph";
import { Btn } from "@/components/ui/Btn";
import {
  listPendingRequests,
  deleteRequest,
  type PendingRequest,
} from "@/lib/requests-store";

type TabKey = "needs-action" | "all" | "requests";

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
  const [activeTab, setActiveTab] = useState<TabKey>("needs-action");
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const [requestsLoaded, setRequestsLoaded] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Always fetch the request count so we can show it on the tab badge,
  // not only when the tab is active.
  useEffect(() => {
    let cancelled = false;
    listPendingRequests().then((rows) => {
      if (cancelled) return;
      setRequests(rows);
      setRequestsLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const onApprove = (r: PendingRequest) => {
    const qs = new URLSearchParams({
      rep: r.repId,
      customer: r.customerId,
      request: r.id,
    });
    router.push(`/schedule/new?${qs.toString()}`);
  };

  const onDecline = async (r: PendingRequest) => {
    if (!confirm(`Decline ${r.repName}'s request for ${r.customerName}?`)) {
      return;
    }
    setBusyId(r.id);
    const result = await deleteRequest(r.id);
    setBusyId(null);
    if (!result.ok) {
      alert(`Couldn't decline: ${result.error}`);
      return;
    }
    setRequests((rs) => rs.filter((x) => x.id !== r.id));
  };

  // "Needs action" and "All activity" tabs depend on a shift_events log
  // table that doesn't exist yet (deferred). They render empty states
  // until that lands. "Requests" is real and live.
  const tabs: { key: TabKey; label: string; count: number; tone?: string }[] = [
    { key: "needs-action", label: "Needs action", count: 0 },
    { key: "all", label: "All activity", count: 0 },
    {
      key: "requests",
      label: "Requests",
      count: requests.length,
      tone: requests.length > 0 ? AC.brand : undefined,
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
          <button
            type="button"
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontFamily: AC.font,
              fontSize: 11.5,
              color: AC.mute,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            Today <AGlyph name="chev-d" size={11} color={AC.mute} />
          </button>
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
                  color: active ? AC.ink : AC.mute,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  marginBottom: -1,
                }}
              >
                {t.label}
                <span
                  style={{
                    padding: "1px 6px",
                    borderRadius: 99,
                    fontSize: 10,
                    fontWeight: 700,
                    background:
                      t.tone === AC.danger
                        ? AC.dangerTint
                        : t.tone === AC.brand
                        ? AC.brandTint
                        : AC.bg,
                    color: t.tone || AC.mute,
                  }}
                >
                  {t.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === "needs-action" && <NeedsActionList />}
      {activeTab === "all" && <AllActivityList />}
      {activeTab === "requests" && (
        <RequestsList
          requests={requests}
          loaded={requestsLoaded}
          busyId={busyId}
          onApprove={onApprove}
          onDecline={onDecline}
        />
      )}
    </Card>
  );
}

function NeedsActionList() {
  return (
    <EmptyTab
      title="No issues right now"
      sub="Late check-ins, off-site exceptions, and stalled shifts will appear here once the event log is wired (deferred)."
    />
  );
}

function AllActivityList() {
  return (
    <EmptyTab
      title="No activity yet"
      sub="Check-ins, claims, and completions will stream here once the event log is wired (deferred)."
    />
  );
}

function EmptyTab({ title, sub }: { title: string; sub: string }) {
  return (
    <div
      style={{
        padding: "32px 24px",
        textAlign: "center",
        background: "#fff",
      }}
    >
      <div style={{ fontFamily: AC.font, fontSize: 13, fontWeight: 600, color: AC.ink2 }}>
        {title}
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
        {sub}
      </div>
    </div>
  );
}

function RequestsList({
  requests,
  loaded,
  busyId,
  onApprove,
  onDecline,
}: {
  requests: PendingRequest[];
  loaded: boolean;
  busyId: string | null;
  onApprove: (r: PendingRequest) => void;
  onDecline: (r: PendingRequest) => void;
}) {
  if (!loaded) {
    return (
      <div
        style={{
          padding: 24,
          fontFamily: AC.font,
          fontSize: 12,
          color: AC.mute,
          textAlign: "center",
        }}
      >
        Loading…
      </div>
    );
  }
  if (requests.length === 0) {
    return (
      <div
        style={{
          padding: 28,
          fontFamily: AC.font,
          fontSize: 12,
          color: AC.mute,
          textAlign: "center",
          background: AC.brandSoft,
          margin: 10,
          borderRadius: 10,
        }}
      >
        <AGlyph name="check" size={18} color={AC.ok} />
        <div style={{ marginTop: 6, fontSize: 12.5, color: AC.ink2, fontWeight: 600 }}>
          No pending requests
        </div>
        <div style={{ marginTop: 3, fontSize: 11 }}>
          Reps can request a customer from the mobile app.
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
            <div style={{ display: "flex", gap: 5, marginTop: 7 }}>
              <Btn
                size="sm"
                kind="primary"
                icon="check"
                onClick={() => onApprove(r)}
                disabled={busyId === r.id}
              >
                Schedule
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
