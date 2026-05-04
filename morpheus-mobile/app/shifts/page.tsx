"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MC } from "@/lib/tokens";
import { SAMPLE, type Shift } from "@/lib/mock-data";
import { listRequestedShifts, removeRequestedShift } from "@/lib/shift-store";
import { AppHeader, AppFooter, CustomerTile, SectionLabel } from "@/components/Chrome";
import { Glyph } from "@/components/Glyph";

export default function ShiftsListPage() {
  const router = useRouter();
  const [expandedId, setExpandedId] = useState<string | null>("gw");
  // Read rep-requested shifts on mount (DB or localStorage fallback).
  const [requested, setRequested] = useState<Shift[]>([]);
  useEffect(() => {
    let cancelled = false;
    listRequestedShifts().then((rows) => {
      if (!cancelled) setRequested(rows);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const onCheckIn = () => router.push("/check-in");
  const onRemoveRequested = (id: string) => {
    // Optimistic UI: remove locally, then send to DB
    setRequested((rs) => rs.filter((r) => r.id !== id));
    removeRequestedShift(id);
  };

  // Combined unscheduled = baseline + rep-requested. De-dup by id.
  const baselineIds = new Set(SAMPLE.unscheduled.map((s) => s.id));
  const todayIds = new Set(SAMPLE.shifts.map((s) => s.id));
  const requestedNonDup = requested.filter(
    (r) => !baselineIds.has(r.id) && !todayIds.has(r.id)
  );
  const allUnscheduled: Shift[] = [...SAMPLE.unscheduled, ...requestedNonDup];

  return (
    <div style={{ background: MC.bg, minHeight: "100%" }}>
      <AppHeader title="Today's Shifts" onBack={() => router.push("/")} withMenu />

      <SectionLabel count={SAMPLE.shifts.length}>Scheduled</SectionLabel>

      <div style={{ padding: "0 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        {SAMPLE.shifts.map((s) => (
          <ShiftRow
            key={s.id}
            shift={s}
            expanded={expandedId === s.id}
            onToggle={() => setExpandedId(expandedId === s.id ? null : s.id)}
            onCheckIn={onCheckIn}
          />
        ))}
      </div>

      <SectionLabel count={allUnscheduled.length}>Unscheduled</SectionLabel>

      <div style={{ padding: "0 16px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
        {allUnscheduled.map((s) => {
          const isRequested = requestedNonDup.some((r) => r.id === s.id);
          return (
            <ShiftRow
              key={s.id}
              shift={s}
              expanded={false}
              unscheduled
              requested={isRequested}
              onRemove={isRequested ? () => onRemoveRequested(s.id) : undefined}
            />
          );
        })}
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
          Add a shift
        </Link>
      </div>

      <AppFooter />
    </div>
  );
}

function ShiftRow({
  shift,
  expanded,
  unscheduled,
  requested,
  onToggle,
  onCheckIn,
  onRemove,
}: {
  shift: Shift;
  expanded: boolean;
  unscheduled?: boolean;
  requested?: boolean;
  onToggle?: () => void;
  onCheckIn?: () => void;
  onRemove?: () => void;
}) {
  return (
    <div
      style={{
        background: MC.card,
        borderRadius: MC.radiusCard,
        border: `1px solid ${MC.line}`,
        overflow: "hidden",
        boxShadow: expanded
          ? "0 12px 28px rgba(10,15,30,.09)"
          : "0 1px 2px rgba(10,15,30,.04)",
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
                <span>{requested ? "Requested · pending approval" : "Not scheduled today"}</span>
                {requested && (
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
                )}
              </>
            ) : (
              <>
                <Glyph name="clock" size={13} color={MC.mute} strokeWidth={2} />
                <span>
                  {shift.start}–{shift.end}
                </span>
                <span style={{ opacity: 0.4 }}>·</span>
                <span>{shift.distance}</span>
              </>
            )}
          </div>
        </div>
        {!unscheduled && (
          <Glyph name={expanded ? "chev-u" : "chev-d"} size={20} color={MC.mute} strokeWidth={2} />
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
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              padding: "10px 12px",
              borderRadius: 10,
              background: MC.warnTint,
              color: "#6d4808",
              fontFamily: MC.font,
              fontSize: 12,
            }}
          >
            <Glyph name="warn" size={14} color="#b27606" />
            <div>
              <b>Check-in will require a reason.</b> You&apos;re {shift.distance} from site
              and the shift started at {shift.start}.
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
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
  color: MC.ink2,
  padding: "0 12px",
};
