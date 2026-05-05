"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MC } from "@/lib/tokens";
import { type Shift } from "@/lib/mock-data";
import { listRequestedShifts, removeRequestedShift } from "@/lib/shift-store";
import {
  listMyShiftsToday,
  listUnassignedShiftsToday,
  claimShift,
} from "@/lib/shifts-store";
import { AppHeader, AppFooter, CustomerTile, SectionLabel } from "@/components/Chrome";
import { Glyph } from "@/components/Glyph";

// A shift row from the DB carries internal id + state alongside the display fields.
type DbShift = Shift & {
  realId: string;
  repId: string | null;
  checkInAt: string | null;
  state: string;
};

export default function ShiftsListPage() {
  const router = useRouter();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Three lists, three sources:
  // - mine:        shifts where rep_id = me, today (from shifts table)
  // - unassigned:  shifts where rep_id IS NULL, today (claimable, from shifts table)
  // - requested:   rep-requested shifts (from requested_shifts table)
  const [mine, setMine] = useState<DbShift[]>([]);
  const [unassigned, setUnassigned] = useState<DbShift[]>([]);
  const [requested, setRequested] = useState<Shift[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [claiming, setClaiming] = useState<string | null>(null);

  const reload = () => {
    Promise.all([
      listMyShiftsToday(),
      listUnassignedShiftsToday(),
      listRequestedShifts(),
    ]).then(([m, u, r]) => {
      // Sort: in-progress first → scheduled → complete (so completed
      // shifts sink to the bottom of the list).
      const order: Record<string, number> = {
        "in-progress": 0,
        scheduled: 1,
        late: 2,
        complete: 3,
      };
      m.sort((a, b) => (order[a.state] ?? 1) - (order[b.state] ?? 1));
      setMine(m);
      setUnassigned(u);
      setRequested(r);
      setLoaded(true);
    });
  };
  useEffect(() => {
    reload();
  }, []);

  const onCheckIn = (shiftId: string) =>
    router.push(`/check-in?shift=${shiftId}`);

  const onClaim = async (shiftRealId: string) => {
    setClaiming(shiftRealId);
    const result = await claimShift(shiftRealId);
    setClaiming(null);
    if (result.ok) {
      reload();
    } else {
      // eslint-disable-next-line no-console
      console.warn("[shifts] claim failed:", result.error);
      alert(`Couldn't claim that shift: ${result.error}`);
    }
  };

  const onRemoveRequested = (id: string) => {
    setRequested((rs) => rs.filter((r) => r.id !== id));
    removeRequestedShift(id);
  };

  // Combine unassigned (DB) + requested (separate table) for the Unscheduled section
  const unassignedIds = new Set(unassigned.map((u) => u.id));
  const requestedNonDup = requested.filter((r) => !unassignedIds.has(r.id));

  return (
    <div style={{ background: MC.bg, minHeight: "100%" }}>
      <AppHeader title="Today's Shifts" onBack={() => router.push("/")} withMenu />

      <SectionLabel count={mine.length}>Scheduled for me</SectionLabel>

      <div style={{ padding: "0 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        {!loaded ? (
          <SkeletonRow />
        ) : mine.length === 0 ? (
          <EmptyState text="No shifts assigned to you today." />
        ) : (
          mine.map((s) => (
            <ShiftRow
              key={s.realId}
              shift={s}
              state={s.state}
              expanded={expandedId === s.realId}
              onToggle={() =>
                setExpandedId(expandedId === s.realId ? null : s.realId)
              }
              onCheckIn={() => onCheckIn(s.realId)}
              onResume={() => router.push("/active")}
            />
          ))
        )}
      </div>

      <SectionLabel count={unassigned.length + requestedNonDup.length}>
        Unscheduled · available
      </SectionLabel>

      <div style={{ padding: "0 16px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
        {!loaded ? null : unassigned.length === 0 && requestedNonDup.length === 0 ? (
          <EmptyState text="Nothing available right now." />
        ) : (
          <>
            {unassigned.map((s) => (
              <ShiftRow
                key={s.realId}
                shift={s}
                expanded={false}
                unscheduled
                claimable
                claiming={claiming === s.realId}
                onClaim={() => onClaim(s.realId)}
              />
            ))}
            {requestedNonDup.map((s) => (
              <ShiftRow
                key={s.id}
                shift={s}
                expanded={false}
                unscheduled
                requested
                onRemove={() => onRemoveRequested(s.id)}
              />
            ))}
          </>
        )}
      </div>

      {/* Add shift CTA — quick path to /add-shift if rep wants to request more */}
      <div style={{ padding: "4px 16px 24px" }}>
        <Link
          href="/add-shift"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: "12px 14px",
            borderRadius: 12,
            background: MC.card,
            border: `1px dashed ${MC.line}`,
            color: MC.brandDeep,
            fontFamily: MC.font,
            fontSize: 13.5,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          <Glyph name="target" size={15} color={MC.brandDeep} strokeWidth={2.2} />
          Request a customer
        </Link>
      </div>

      <AppFooter />
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div
      style={{
        padding: "20px 14px",
        textAlign: "center",
        fontFamily: MC.font,
        fontSize: 13,
        color: MC.mute,
        background: MC.card,
        border: `1px dashed ${MC.line}`,
        borderRadius: MC.radiusCard,
      }}
    >
      {text}
    </div>
  );
}

function SkeletonRow() {
  return (
    <div
      style={{
        height: 80,
        background: MC.card,
        border: `1px solid ${MC.line}`,
        borderRadius: MC.radiusCard,
        opacity: 0.5,
      }}
    />
  );
}

function ShiftRow({
  shift,
  state,
  expanded,
  unscheduled,
  requested,
  claimable,
  claiming,
  onToggle,
  onCheckIn,
  onResume,
  onRemove,
  onClaim,
}: {
  shift: Shift;
  /** The shift's lifecycle state (scheduled | in-progress | complete | late). Only meaningful for "Mine". */
  state?: string;
  expanded: boolean;
  unscheduled?: boolean;
  requested?: boolean;
  claimable?: boolean;
  claiming?: boolean;
  onToggle?: () => void;
  onCheckIn?: () => void;
  onResume?: () => void;
  onRemove?: () => void;
  onClaim?: () => void;
}) {
  const isComplete = state === "complete";
  const isInProgress = state === "in-progress";
  const stateBadge = (() => {
    if (unscheduled) return null;
    if (isComplete) {
      return { label: "Complete", bg: MC.okTint, fg: "#0d6a45" };
    }
    if (isInProgress) {
      return { label: "In progress", bg: MC.brandTint, fg: MC.brandInk };
    }
    return null;
  })();
  return (
    <div
      style={{
        background: MC.card,
        borderRadius: MC.radiusCard,
        border: `1px solid ${isInProgress ? MC.brand + "55" : MC.line}`,
        overflow: "hidden",
        boxShadow: expanded
          ? "0 12px 28px rgba(10,15,30,.09)"
          : "0 1px 2px rgba(10,15,30,.04)",
        opacity: isComplete ? 0.78 : 1,
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: "100%",
          background: "transparent",
          border: "none",
          padding: 14,
          display: "flex",
          gap: 12,
          alignItems: "center",
          cursor: onToggle ? "pointer" : "default",
          textAlign: "left",
        }}
      >
        <CustomerTile initials={shift.initials} color={shift.color} size={52} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: MC.fontDisplay,
              fontSize: 16.5,
              fontWeight: 700,
              color: MC.ink,
              letterSpacing: -0.25,
              lineHeight: 1.15,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {shift.name}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginTop: 4,
              fontFamily: MC.font,
              fontSize: 12.5,
              color: MC.mute,
            }}
          >
            <span
              style={{
                background: MC.bg,
                color: MC.ink2,
                borderRadius: 6,
                padding: "2px 6px",
                fontWeight: 600,
                fontSize: 11,
                letterSpacing: 0.3,
              }}
            >
              #{shift.code}
            </span>
            {unscheduled ? (
              <>
                {claimable ? (
                  <>
                    <Glyph name="clock" size={13} color={MC.mute} strokeWidth={2} />
                    <span>
                      {shift.start}–{shift.end}
                    </span>
                    <span
                      style={{
                        padding: "1px 7px",
                        borderRadius: 999,
                        background: MC.brandTint,
                        color: MC.brandInk,
                        fontSize: 9.5,
                        fontWeight: 700,
                        letterSpacing: 0.4,
                        textTransform: "uppercase",
                      }}
                    >
                      Available
                    </span>
                  </>
                ) : requested ? (
                  <>
                    <span>Requested · pending approval</span>
                    <span
                      style={{
                        padding: "1px 7px",
                        borderRadius: 999,
                        background: MC.brandTint,
                        color: MC.brandInk,
                        fontSize: 9.5,
                        fontWeight: 700,
                        letterSpacing: 0.4,
                        textTransform: "uppercase",
                      }}
                    >
                      NEW
                    </span>
                  </>
                ) : (
                  <span>Not scheduled today</span>
                )}
              </>
            ) : (
              <>
                <Glyph name="clock" size={13} color={MC.mute} strokeWidth={2} />
                <span style={{ textDecoration: isComplete ? "line-through" : "none" }}>
                  {shift.start}–{shift.end}
                </span>
                {stateBadge && (
                  <span
                    style={{
                      padding: "1px 7px",
                      borderRadius: 999,
                      background: stateBadge.bg,
                      color: stateBadge.fg,
                      fontSize: 9.5,
                      fontWeight: 700,
                      letterSpacing: 0.4,
                      textTransform: "uppercase",
                    }}
                  >
                    {stateBadge.label}
                  </span>
                )}
                {!stateBadge && shift.distance && (
                  <>
                    <span style={{ opacity: 0.4 }}>·</span>
                    <span>{shift.distance}</span>
                  </>
                )}
              </>
            )}
          </div>
        </div>
        {!unscheduled && (
          <Glyph
            name={expanded ? "chev-u" : "chev-d"}
            size={20}
            color={MC.mute}
            strokeWidth={2}
          />
        )}
        {unscheduled && claimable && onClaim && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClaim();
            }}
            disabled={claiming}
            style={{
              padding: "8px 14px",
              borderRadius: 10,
              background: claiming ? MC.line : MC.brand,
              color: "#fff",
              border: "none",
              cursor: claiming ? "not-allowed" : "pointer",
              fontFamily: MC.font,
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: -0.1,
              boxShadow: claiming ? "none" : `0 2px 6px ${MC.brand}55`,
            }}
          >
            {claiming ? "Claiming…" : "Claim"}
          </button>
        )}
        {unscheduled && requested && onRemove && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            aria-label="Remove requested shift"
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: "transparent",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Glyph name="close" size={16} color={MC.hint} />
          </button>
        )}
      </button>

      {expanded && !unscheduled && (
        <div
          style={{
            background: "#FAFBFC",
            borderTop: `1px solid ${MC.line}`,
            padding: "12px 14px 14px",
          }}
        >
          {isComplete ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                background: MC.okTint,
                borderRadius: 11,
                color: "#0d6a45",
                fontFamily: MC.font,
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              <Glyph name="check-circle" size={18} color={MC.ok} strokeWidth={2.2} />
              <span>Shift complete. Nice work.</span>
            </div>
          ) : isInProgress ? (
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" style={secondaryBtn}>
                <Glyph name="pin" size={16} color={MC.ink2} />
                <span>Directions</span>
              </button>
              <button
                type="button"
                onClick={onResume}
                style={{ ...secondaryBtn, flex: 1.4 }}
              >
                <span
                  style={{
                    background: MC.brand,
                    color: "#fff",
                    width: 24,
                    height: 24,
                    borderRadius: 6,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginRight: 6,
                  }}
                >
                  <Glyph name="arrow-r" size={14} color="#fff" strokeWidth={2.2} />
                </span>
                <span style={{ color: MC.brandDeep, fontWeight: 600 }}>Resume shift</span>
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" style={secondaryBtn}>
                <Glyph name="pin" size={16} color={MC.ink2} />
                <span>Directions</span>
              </button>
              <button
                type="button"
                onClick={onCheckIn}
                style={{ ...secondaryBtn, flex: 1.4 }}
              >
                <span
                  style={{
                    background: MC.brand,
                    color: "#fff",
                    width: 24,
                    height: 24,
                    borderRadius: 6,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginRight: 6,
                  }}
                >
                  <Glyph name="log" size={14} color="#fff" strokeWidth={2.2} />
                </span>
                <span style={{ color: MC.brandDeep, fontWeight: 600 }}>Check in</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const secondaryBtn: React.CSSProperties = {
  flex: 1,
  height: 44,
  borderRadius: 11,
  background: "#fff",
  border: `1px solid ${MC.line}`,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  fontFamily: MC.font,
  fontSize: 14,
  fontWeight: 500,
  color: "#111418",
  padding: "0 12px",
};
