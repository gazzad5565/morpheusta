"use client";

/**
 * Admin Requests page — pending rep-requested shifts.
 *
 * Reps tap "Request a customer" on the mobile app, which inserts a row into
 * `requested_shifts` with status='pending'. This page lists those rows so a
 * manager can:
 *   - Approve → goes to /schedule/new with rep + customer pre-filled and a
 *     ?request= param. On successful shift creation that page deletes the
 *     pending request, so it disappears from this inbox.
 *   - Decline → deletes the pending request immediately (rep can re-request
 *     later if needed).
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminShell } from "@/components/shell/AdminShell";
import { Btn } from "@/components/ui/Btn";
import { Card, SectionTitle } from "@/components/ui/Card";
import { AGlyph } from "@/components/ui/AGlyph";
import { AC } from "@/lib/tokens";
import {
  listPendingRequests,
  deleteRequest,
  subscribeRequests,
  type PendingRequest,
} from "@/lib/requests-store";

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const ms = Date.now() - d.getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function RequestsPage() {
  const router = useRouter();
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const reload = () => {
    listPendingRequests().then((rows) => {
      setRequests(rows);
      setLoading(false);
    });
  };

  useEffect(() => {
    reload();
    // Realtime: refetch on any insert/update/delete so the inbox flips
    // the moment a rep submits or another admin handles a row.
    const unsub = subscribeRequests(reload);
    return () => unsub();
  }, []);

  const onApprove = (r: PendingRequest) => {
    // Hand off to the schedule form with rep + customer + request id pre-filled.
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
    setPendingDelete(r.id);
    const result = await deleteRequest(r.id);
    setPendingDelete(null);
    if (!result.ok) {
      alert(`Couldn't decline: ${result.error}`);
      return;
    }
    setRequests((rs) => rs.filter((x) => x.id !== r.id));
  };

  return (
    <AdminShell
      title="Requests"
      breadcrumbs={["Home", "Requests"]}
      actions={
        <Btn size="sm" onClick={reload}>
          Refresh
        </Btn>
      }
    >
      <div style={{ padding: 20 }}>
        <Card padding={0}>
          <div
            style={{
              padding: "12px 16px",
              borderBottom: `1px solid ${AC.line}`,
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <SectionTitle>Pending rep requests</SectionTitle>
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
              {requests.length}
            </span>
            <div style={{ flex: 1 }} />
            <div style={{ fontFamily: AC.font, fontSize: 11.5, color: AC.mute }}>
              Reps tap “Request a customer” on their phone — those land here.
            </div>
          </div>

          {loading ? (
            <div
              style={{
                padding: 28,
                fontFamily: AC.font,
                fontSize: 13,
                color: AC.mute,
                textAlign: "center",
              }}
            >
              Loading requests…
            </div>
          ) : requests.length === 0 ? (
            <div
              style={{
                padding: 32,
                fontFamily: AC.font,
                fontSize: 13,
                color: AC.mute,
                textAlign: "center",
              }}
            >
              <AGlyph name="check" size={20} color={AC.ok} />
              <div style={{ marginTop: 8 }}>No pending requests.</div>
              <div style={{ marginTop: 4, fontSize: 11.5 }}>
                When a rep requests a customer from the mobile app, it'll show up here.
              </div>
            </div>
          ) : (
            <div>
              {requests.map((r, i) => (
                <RequestRow
                  key={r.id}
                  request={r}
                  isLast={i === requests.length - 1}
                  onApprove={() => onApprove(r)}
                  onDecline={() => onDecline(r)}
                  busy={pendingDelete === r.id}
                />
              ))}
            </div>
          )}
        </Card>
      </div>
    </AdminShell>
  );
}

function RequestRow({
  request: r,
  isLast,
  onApprove,
  onDecline,
  busy,
}: {
  request: PendingRequest;
  isLast: boolean;
  onApprove: () => void;
  onDecline: () => void;
  busy: boolean;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1.4fr 1.6fr 130px 200px",
        gap: 16,
        alignItems: "center",
        padding: "14px 16px",
        borderBottom: isLast ? "none" : `1px solid ${AC.lineDim}`,
        background: "#fff",
      }}
    >
      {/* Rep */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 99,
            background: AC.brandDeep,
            color: "#fff",
            fontFamily: AC.font,
            fontSize: 12,
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {r.repName.slice(0, 2).toUpperCase()}
        </div>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontFamily: AC.font,
              fontSize: 13,
              fontWeight: 600,
              color: AC.ink,
              letterSpacing: -0.1,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {r.repName}
          </div>
          <div
            style={{
              fontFamily: AC.font,
              fontSize: 11,
              color: AC.mute,
              marginTop: 1,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {r.repEmail}
          </div>
        </div>
      </div>

      {/* Customer */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 7,
            background: r.customerColor,
            color: "#fff",
            fontFamily: AC.font,
            fontSize: 11,
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {r.customerInitials}
        </div>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontFamily: AC.font,
              fontSize: 13,
              fontWeight: 600,
              color: AC.ink,
              letterSpacing: -0.1,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {r.customerName}
          </div>
          <div
            style={{
              fontFamily: AC.font,
              fontSize: 11,
              color: AC.mute,
              marginTop: 1,
            }}
          >
            #{r.customerCode}
          </div>
        </div>
      </div>

      {/* Requested-at */}
      <div
        style={{
          fontFamily: AC.font,
          fontSize: 12,
          color: AC.mute,
          fontWeight: 500,
        }}
      >
        {formatRelative(r.requestedAt)}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Btn
          kind="ghost"
          size="sm"
          icon="x"
          onClick={onDecline}
          disabled={busy}
        >
          Decline
        </Btn>
        <Btn
          kind="primary"
          size="sm"
          icon="check"
          onClick={onApprove}
          disabled={busy}
        >
          Approve & schedule
        </Btn>
      </div>
    </div>
  );
}
