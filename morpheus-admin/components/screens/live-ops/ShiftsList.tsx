"use client";

/**
 * ShiftsList — Live Ops table showing today's shifts.
 *
 * Pulls from Supabase via:
 *   - listShifts() → today's shifts (customer joined)
 *   - listProfiles({ role: "rep" }) → reps so we can resolve rep_id → name
 *
 * Filtering is client-side via SegTabs (All / In progress / Travelling /
 * On break / Issues / Unassigned). Sort is by start_time ascending.
 */

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { AC } from "@/lib/tokens";
import { Card } from "@/components/ui/Card";
import { AGlyph } from "@/components/ui/AGlyph";
import { RepAvatar } from "@/components/ui/Avatars";
import { SegTabs } from "@/components/ui/SegTabs";
import { listShifts, subscribeShifts, type ShiftRow } from "@/lib/shifts-store";
import { listProfiles, displayName, type Profile } from "@/lib/profiles-store";

const STATE_MAP: Record<string, { label: string; bg: string; ink: string; dot: string }> = {
  "in-progress": { label: "In progress", bg: AC.okTint, ink: "#0F5A38", dot: AC.ok },
  travelling: { label: "Travelling", bg: AC.warnTint, ink: "#7A560A", dot: AC.warn },
  "on-break": { label: "On break", bg: "#E6E9F8", ink: "#241B5A", dot: "#5447BD" },
  late: { label: "Late", bg: AC.dangerTint, ink: "#6E1430", dot: AC.danger },
  unassigned: { label: "Unassigned", bg: AC.bg, ink: AC.mute, dot: AC.faint },
  scheduled: { label: "Scheduled", bg: AC.bg, ink: AC.mute, dot: AC.faint },
  complete: { label: "Complete", bg: AC.okTint, ink: "#0F5A38", dot: AC.ok },
};

function deriveInitials(p: Profile): string {
  const source = p.name?.trim() || p.email.split("@")[0];
  const words = source.split(/[\s._-]+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

function formatTimeLabel(t: string): string {
  if (!t) return "";
  const [hh, mm] = t.split(":");
  const h = parseInt(hh, 10);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${mm} ${ampm}`;
}

function formatCheckIn(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

interface RepLite {
  id: string;
  name: string;
  initials: string;
}

const TABS = ["All", "In progress", "Travelling", "On break", "Issues", "Unassigned"] as const;

export function ShiftsList() {
  const [rows, setRows] = useState<ShiftRow[]>([]);
  const [reps, setReps] = useState<Record<string, RepLite>>({});
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<string>("All");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [shiftRows, profileRows] = await Promise.all([
        listShifts(),
        listProfiles({ role: "rep" }),
      ]);
      if (cancelled) return;
      const repMap: Record<string, RepLite> = {};
      for (const p of profileRows) {
        repMap[p.id] = {
          id: p.id,
          name: displayName(p),
          initials: deriveInitials(p),
        };
      }
      setReps(repMap);
      setRows(shiftRows);
      setLoading(false);
    };
    load();
    // Refetch on any shifts change (rep checks in/out, claims, manager
    // schedules, etc) so the table updates without a manual refresh.
    const unsub = subscribeShifts(load);
    // Refetch when the tab comes back into focus — covers the case
    // where the admin opened the dashboard yesterday, left it idle
    // overnight, and is now looking at it again. listShifts() reads
    // "today" at call time so this picks up the new day's window.
    const onVis = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      unsub();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  // Effective state used both for display & filtering.
  // If rep_id is null we treat it as "unassigned" regardless of stored state.
  const effectiveState = (s: ShiftRow): string => (s.rep_id ? s.state : "unassigned");

  const filtered = useMemo(() => {
    if (active === "All") return rows;
    if (active === "Unassigned") return rows.filter((s) => !s.rep_id);
    if (active === "Issues")
      return rows.filter((s) => effectiveState(s) === "late");
    const key = active.toLowerCase().replace(" ", "-");
    return rows.filter((s) => effectiveState(s) === key);
  }, [rows, active]);

  return (
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
        <div
          style={{
            fontFamily: AC.font,
            fontSize: 13,
            fontWeight: 700,
            color: AC.ink,
            letterSpacing: -0.1,
          }}
        >
          Today&apos;s shifts
        </div>
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
          {filtered.length}
        </span>
        <div style={{ flex: 1 }} />
        <SegTabs tabs={TABS} active={active} onChange={setActive} />
        <div style={{ width: 1, height: 18, background: AC.line }} />
        <button
          type="button"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            background: "transparent",
            border: "none",
            cursor: "pointer",
            fontFamily: AC.font,
            fontSize: 12,
            color: AC.mute,
            fontWeight: 600,
          }}
        >
          <AGlyph name="sort" size={12} color={AC.mute} />
          Start time
        </button>
      </div>

      <div>
        <ShiftRowView header />
        {loading ? (
          <EmptyRow text="Loading shifts…" />
        ) : filtered.length === 0 ? (
          <EmptyRow
            text={
              active === "All"
                ? "No shifts scheduled today. Click 'New shift' to add one."
                : `Nothing matches '${active}' right now.`
            }
          />
        ) : (
          filtered.map((s) => (
            <ShiftRowView key={s.id} row={s} rep={s.rep_id ? reps[s.rep_id] : undefined} />
          ))
        )}
      </div>
    </Card>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div
      style={{
        padding: "28px 16px",
        textAlign: "center",
        fontFamily: AC.font,
        fontSize: 12.5,
        color: AC.mute,
        background: "#fff",
      }}
    >
      {text}
    </div>
  );
}

function shiftRowGrid(opts?: { header?: boolean }): CSSProperties {
  const header = opts?.header;
  return {
    display: "grid",
    gridTemplateColumns: "4px 1.4fr 1.6fr 130px 130px 110px 110px 36px",
    gap: 14,
    alignItems: "center",
    padding: header ? "8px 16px" : "12px 16px",
    borderBottom: `1px solid ${header ? AC.line : AC.lineDim}`,
    background: header ? AC.bg : "#fff",
    fontFamily: AC.font,
    fontSize: header ? 11 : 12,
    fontWeight: header ? 600 : 500,
    color: header ? AC.mute : AC.ink2,
    letterSpacing: header ? 0.3 : 0,
    textTransform: header ? "uppercase" : "none",
  };
}

function ShiftRowView({
  row,
  rep,
  header,
}: {
  row?: ShiftRow;
  rep?: RepLite;
  header?: boolean;
}) {
  if (header) {
    return (
      <div style={shiftRowGrid({ header: true })}>
        <div></div>
        <div>Rep</div>
        <div>Customer</div>
        <div>Window</div>
        <div>State</div>
        <div>Tasks</div>
        <div>Check-in</div>
        <div></div>
      </div>
    );
  }
  if (!row) return null;

  const stateKey = row.rep_id ? row.state : "unassigned";
  const state = STATE_MAP[stateKey] || STATE_MAP.scheduled;
  const checkIn = formatCheckIn(row.check_in_at);

  // Make the row a link to the shift detail page. The trailing "more"
  // button stops propagation so it doesn't trigger navigation.
  return (
    <a
      href={`/shifts/${row.id}`}
      style={{
        ...shiftRowGrid(),
        textDecoration: "none",
        color: "inherit",
        cursor: "pointer",
      }}
    >
      <div
        style={{
          width: 3,
          alignSelf: "stretch",
          background: state.dot,
          borderRadius: 2,
          margin: "4px 0",
        }}
      />

      <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
        {rep ? (
          <>
            <RepAvatar rep={{ initials: rep.initials }} size={28} />
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontFamily: AC.font,
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: AC.ink,
                  letterSpacing: -0.1,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {rep.name}
              </div>
              <div style={{ fontFamily: AC.font, fontSize: 11, color: AC.mute, marginTop: 1 }}>
                Rep
              </div>
            </div>
          </>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 99,
                border: `1.5px dashed ${AC.faint}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <AGlyph name="plus" size={12} color={AC.mute} />
            </div>
            <div
              style={{
                fontFamily: AC.font,
                fontSize: 12.5,
                fontWeight: 600,
                color: AC.mute,
                letterSpacing: -0.1,
              }}
            >
              Unassigned
            </div>
          </div>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
        {row.customers && (
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: 7,
              background: row.customers.color,
              color: "#fff",
              fontFamily: AC.font,
              fontSize: 10.5,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              letterSpacing: 0.2,
              flexShrink: 0,
            }}
          >
            {row.customers.initials}
          </div>
        )}
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontFamily: AC.font,
              fontSize: 12.5,
              fontWeight: 600,
              color: AC.ink,
              letterSpacing: -0.1,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {row.customers?.name || "—"}
          </div>
          <div style={{ fontFamily: AC.font, fontSize: 11, color: AC.mute, marginTop: 1 }}>
            #{row.customers?.code ?? ""}
          </div>
        </div>
      </div>

      <div
        style={{
          fontFamily: AC.font,
          fontSize: 12.5,
          color: AC.ink2,
          fontWeight: 600,
          letterSpacing: -0.1,
        }}
      >
        {formatTimeLabel(row.start_time)}
        <span style={{ color: AC.faint, padding: "0 2px" }}>—</span>
        {formatTimeLabel(row.end_time)}
      </div>

      <div>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "3px 8px",
            borderRadius: 99,
            background: state.bg,
            color: state.ink,
            fontFamily: AC.font,
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          <span style={{ width: 5, height: 5, borderRadius: 99, background: state.dot }} />
          {state.label}
        </span>
      </div>

      <TaskBar done={row.tasks_done} total={row.tasks_total} />

      <div
        style={{
          fontFamily: AC.font,
          fontSize: 12,
          color: checkIn ? AC.ink2 : AC.mute,
          fontWeight: 600,
        }}
      >
        {checkIn || "—"}
      </div>

      <button
        type="button"
        onClick={(e) => {
          // Don't navigate to /shifts/[id] when the menu trigger is tapped.
          e.preventDefault();
          e.stopPropagation();
        }}
        style={{
          width: 26,
          height: 26,
          borderRadius: 6,
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
    </a>
  );
}

function TaskBar({ done, total }: { done: number; total: number }) {
  const pct = total ? (done / total) * 100 : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div
        style={{
          flex: 1,
          height: 5,
          borderRadius: 99,
          background: AC.bgDeep,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: pct === 100 ? AC.ok : AC.brand,
            borderRadius: 99,
          }}
        />
      </div>
      <div
        style={{
          fontFamily: AC.fontMono,
          fontSize: 11,
          color: AC.ink2,
          fontWeight: 600,
          minWidth: 26,
        }}
      >
        {done}/{total}
      </div>
    </div>
  );
}
