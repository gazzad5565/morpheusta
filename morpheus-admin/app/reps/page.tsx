"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/shell/AdminShell";
import { Btn } from "@/components/ui/Btn";
import { Card } from "@/components/ui/Card";
import { AGlyph } from "@/components/ui/AGlyph";
import { RepAvatar } from "@/components/ui/Avatars";
import { AC } from "@/lib/tokens";
import { listProfiles, displayName, type Profile } from "@/lib/profiles-store";
import { listShifts } from "@/lib/shifts-store";
import type { CSSProperties } from "react";

interface RepWithStats extends Profile {
  displayName: string;
  initials: string;
  joinedLabel: string;
  shiftsToday: number;
  shiftsTodayClaimed: number; // shifts they assigned themselves to (state != scheduled)
}

function deriveInitials(name: string, email: string): string {
  const source = name?.trim() || email.split("@")[0];
  const words = source.split(/[\s._-]+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

function formatJoined(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function RepsPage() {
  const [reps, setReps] = useState<RepWithStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listProfiles({ role: "rep" }), listShifts()]).then(
      ([profiles, shifts]) => {
        if (cancelled) return;
        // Tally shifts-assigned-today per rep
        const shiftsByRep = new Map<string, number>();
        for (const s of shifts) {
          if (s.rep_id) {
            shiftsByRep.set(s.rep_id, (shiftsByRep.get(s.rep_id) || 0) + 1);
          }
        }
        const enriched: RepWithStats[] = profiles.map((p) => ({
          ...p,
          displayName: displayName(p),
          initials: deriveInitials(p.name || "", p.email),
          joinedLabel: formatJoined(p.created_at),
          shiftsToday: shiftsByRep.get(p.id) || 0,
          shiftsTodayClaimed: 0,
        }));
        setReps(enriched);
        setLoading(false);
      }
    );
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AdminShell
      title="Reps"
      breadcrumbs={["Home", "Reps"]}
      actions={
        <div style={{ display: "flex", gap: 8 }}>
          <Btn icon="upload" size="sm">Import CSV</Btn>
          <Btn icon="plus" kind="primary" size="sm">Invite rep</Btn>
        </div>
      }
    >
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
        <Card padding={12}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <FilterChip active>
              All <span style={{ color: AC.mute, fontWeight: 500 }}>· {reps.length}</span>
            </FilterChip>
            <FilterChip>With shifts today · {reps.filter((r) => r.shiftsToday > 0).length}</FilterChip>
            <FilterChip>No shifts today · {reps.filter((r) => r.shiftsToday === 0).length}</FilterChip>
            <div style={{ flex: 1 }} />
            <div
              style={{
                fontFamily: AC.font,
                fontSize: 12,
                color: AC.mute,
                fontWeight: 500,
              }}
            >
              {loading ? "Loading…" : "Live · from profiles table"}
            </div>
          </div>
        </Card>

        <Card padding={0}>
          <div style={repsHeader()}>
            <div style={{ paddingLeft: 4 }}>
              <input type="checkbox" style={CB} readOnly />
            </div>
            <div>Rep</div>
            <div>Role</div>
            <div>Joined</div>
            <div>Shifts today</div>
            <div></div>
          </div>

          {loading ? (
            <div style={{ padding: 24, textAlign: "center", fontFamily: AC.font, fontSize: 13, color: AC.mute }}>
              Loading reps…
            </div>
          ) : reps.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center" }}>
              <div
                style={{
                  fontFamily: AC.font,
                  fontSize: 13,
                  color: AC.mute,
                  marginBottom: 8,
                }}
              >
                No reps signed up yet.
              </div>
              <div style={{ fontFamily: AC.font, fontSize: 12, color: AC.faint }}>
                Reps appear here automatically when they sign up via the mobile app.
              </div>
            </div>
          ) : (
            reps.map((rep) => <RepRow key={rep.id} rep={rep} />)
          )}

          <div
            style={{
              padding: "12px 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              borderTop: `1px solid ${AC.line}`,
            }}
          >
            <div style={{ fontFamily: AC.font, fontSize: 12, color: AC.mute }}>
              {loading ? "…" : `${reps.length} rep${reps.length === 1 ? "" : "s"} signed up`}
            </div>
          </div>
        </Card>
      </div>
    </AdminShell>
  );
}

const CB: CSSProperties = { width: 14, height: 14, accentColor: AC.brand };
const COLS = "36px 2fr 100px 140px 130px 36px";

function repsHeader(): CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: COLS,
    alignItems: "center",
    gap: 14,
    padding: "10px 16px",
    background: AC.bg,
    borderBottom: `1px solid ${AC.line}`,
    fontFamily: AC.font,
    fontSize: 11,
    fontWeight: 600,
    color: AC.mute,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  };
}

function RepRow({ rep }: { rep: RepWithStats }) {
  return (
    <Link
      href={`/reps/${rep.id}`}
      style={{
        display: "grid",
        gridTemplateColumns: COLS,
        alignItems: "center",
        gap: 14,
        padding: "12px 16px",
        borderBottom: `1px solid ${AC.lineDim}`,
        background: "#fff",
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <div style={{ paddingLeft: 4 }} onClick={(e) => e.preventDefault()}>
        <input type="checkbox" style={CB} readOnly />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <RepAvatar rep={{ initials: rep.initials }} size={32} />
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
            {rep.displayName}
          </div>
          <div
            style={{
              fontFamily: AC.font,
              fontSize: 11.5,
              color: AC.mute,
              marginTop: 1,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {rep.email}
          </div>
        </div>
      </div>
      <div>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "2px 8px",
            borderRadius: 99,
            background: rep.role === "manager" ? AC.brandSoft : AC.bg,
            color: rep.role === "manager" ? AC.brandInk : AC.ink2,
            fontFamily: AC.font,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: 0.2,
            textTransform: "capitalize",
          }}
        >
          {rep.role}
        </span>
      </div>
      <div style={{ fontFamily: AC.font, fontSize: 12.5, color: AC.ink2, fontWeight: 500 }}>
        {rep.joinedLabel}
      </div>
      <div>
        {rep.shiftsToday > 0 ? (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "2px 9px",
              borderRadius: 99,
              background: AC.okTint,
              color: "#0F5A38",
              fontFamily: AC.font,
              fontSize: 11.5,
              fontWeight: 700,
            }}
          >
            <span style={{ width: 5, height: 5, borderRadius: 99, background: AC.ok }} />
            {rep.shiftsToday} today
          </div>
        ) : (
          <span style={{ fontFamily: AC.font, fontSize: 12, color: AC.faint }}>
            None today
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={(e) => e.preventDefault()}
        style={{
          width: 26,
          height: 26,
          background: "transparent",
          border: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <AGlyph name="more" size={16} color={AC.mute} />
      </button>
    </Link>
  );
}

function FilterChip({ children, active }: { children: React.ReactNode; active?: boolean }) {
  return (
    <button
      type="button"
      style={{
        padding: "6px 12px",
        borderRadius: 99,
        background: active ? AC.ink : "#fff",
        color: active ? "#fff" : AC.ink2,
        border: `1px solid ${active ? AC.ink : AC.line}`,
        fontFamily: AC.font,
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: -0.1,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}
