"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useState, useEffect, useMemo } from "react";
import { MC } from "@/lib/tokens";
import { type Shift } from "@/lib/mock-data";
import { AppHeader, AppFooter, CustomerTile, StatusChip, PrimaryButton } from "@/components/Chrome";
import { Glyph, formatTime } from "@/components/Glyph";
import { getUser } from "@/lib/auth";
import { listMyShiftsToday, subscribeShifts } from "@/lib/shifts-store";
import { getMyProfile } from "@/lib/profiles-store";
import { listLibraryFiles } from "@/lib/library-store";

// MapLibre needs `window`; defer to client-only.
const DashboardMap = dynamic(
  () => import("@/components/DashboardMap").then((m) => m.DashboardMap),
  { ssr: false }
);

type DbShift = Shift & {
  realId: string;
  repId: string | null;
  checkInAt: string | null;
  state: string;
};

function formatTodayHeader(): string {
  const d = new Date();
  return d
    .toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short", year: "numeric" })
    .replace(",", " ·");
}

function formatNowTime(): string {
  return new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Friendly display name from an email address. Falls back gracefully when
 * email is missing or malformed. Examples:
 *   gary@example.com           → "Gary"
 *   gary.smith@example.com     → "Gary"
 *   gary_smith@example.com     → "Gary"
 *   merchandiser2@example.com  → "Merchandiser2"
 */
function nameFromEmail(email: string | null | undefined): string {
  if (!email) return "there";
  const local = email.split("@")[0] || "";
  const firstPart = local.split(/[._-]/)[0] || local;
  if (!firstPart) return "there";
  return firstPart.charAt(0).toUpperCase() + firstPart.slice(1);
}

export default function DashboardPage() {
  // Lifted state — UpNextCard reacts to these.
  // directionsOpen: rep tapped "Directions" to preview the route on the map.
  // travellingSince: rep tapped "Start travelling" — route is now live.
  const [directionsOpen, setDirectionsOpen] = useState(false);
  const [travellingSince, setTravellingSince] = useState<number | null>(null);

  // Greeting prefers the profiles.name (set on signup), falls back to email.
  const [displayName, setDisplayName] = useState<string>("");
  // Real shifts-today list, used for the count + the progress bar.
  const [shifts, setShifts] = useState<DbShift[]>([]);
  const [shiftsLoaded, setShiftsLoaded] = useState(false);
  // Real library file count, used for the Library shortcut subtitle.
  const [libraryCount, setLibraryCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      Promise.all([getMyProfile(), getUser(), listMyShiftsToday(), listLibraryFiles()]).then(
        ([profile, user, myShifts, libFiles]) => {
          if (cancelled) return;
          const fromProfile = profile?.name?.trim();
          setDisplayName(fromProfile || nameFromEmail(user?.email));
          setShifts(myShifts);
          setShiftsLoaded(true);
          setLibraryCount(libFiles.length);
        }
      );
    load();
    // Refetch on tab-becomes-visible so a rep who left the PWA open
    // overnight wakes up to today's shifts, not yesterday's. Also covers
    // the "checked in late last night, opens at 8 AM" case.
    const onVis = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVis);
    // Realtime: refetch when ANY shift row changes — covers the case
    // where a manager assigns / reassigns / removes a shift while the
    // rep is actively looking at the dashboard. Without this the rep
    // would only see new assignments after switching tabs and coming
    // back (visibilitychange).
    const unsubShifts = subscribeShifts(load);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
      unsubShifts();
    };
  }, []);

  const todayHeader = useMemo(formatTodayHeader, []);
  // Tick the AppHeader's last-sync label so it reflects real "now" rather
  // than a hardcoded time. Updates once a minute.
  const [nowLabel, setNowLabel] = useState<string>(() => formatNowTime());
  useEffect(() => {
    const t = setInterval(() => setNowLabel(formatNowTime()), 60_000);
    return () => clearInterval(t);
  }, []);

  const completedCount = shifts.filter((s) => s.state === "complete").length;
  const inProgressCount = shifts.filter((s) => s.state === "in-progress").length;
  const totalCount = shifts.length;

  return (
    <div style={{ background: MC.bg, minHeight: "100%" }}>
      <AppHeader title="Dashboard" lastSync={nowLabel} />

      {/* Welcome — extra top padding so it clears the absolute-positioned LAST SYNC label */}
      <div style={{ padding: "32px 20px 6px" }}>
        <div
          style={{
            fontFamily: MC.font,
            fontSize: 12,
            fontWeight: 600,
            color: MC.hint,
            letterSpacing: 1,
            textTransform: "uppercase",
          }}
        >
          {todayHeader}
        </div>
        <div
          style={{
            fontFamily: MC.fontDisplay,
            fontSize: 26,
            fontWeight: 700,
            color: MC.ink,
            letterSpacing: -0.6,
            marginTop: 4,
          }}
        >
          Welcome back{displayName ? `, ${displayName}` : ""}
        </div>
      </div>

      {/* Shifts-today summary — real data */}
      <div style={{ padding: "14px 20px 8px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <div
              style={{
                fontFamily: MC.font,
                fontSize: 30,
                fontWeight: 700,
                color: MC.ink,
                letterSpacing: -0.8,
                lineHeight: 1,
              }}
            >
              {shiftsLoaded ? totalCount : "—"}
            </div>
            <div style={{ fontFamily: MC.font, fontSize: 14, fontWeight: 500, color: MC.mute }}>
              shift{totalCount === 1 ? "" : "s"} today
              {shiftsLoaded && completedCount > 0 && (
                <span style={{ marginLeft: 6, color: MC.ok, fontWeight: 600 }}>
                  · {completedCount} done
                </span>
              )}
            </div>
          </div>
          <Link
            href="/shifts"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "6px 8px",
              fontFamily: MC.font,
              fontSize: 13,
              fontWeight: 600,
              color: MC.brandDeep,
              letterSpacing: -0.1,
              textDecoration: "none",
            }}
          >
            View all
            <Glyph name="chev-r" size={14} color={MC.brandDeep} />
          </Link>
        </div>
        {/* Progress bar: green = complete, brand = in-progress, grey = scheduled. */}
        {totalCount > 0 && (
          <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
            {shifts.map((s) => (
              <div
                key={s.realId}
                style={{
                  flex: 1,
                  height: 5,
                  borderRadius: 999,
                  background:
                    s.state === "complete"
                      ? MC.ok
                      : s.state === "in-progress"
                      ? MC.brand
                      : "#DCE0E6",
                }}
                title={`${s.name} · ${s.state}`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Real map of today's shift locations + the rep's own GPS dot. */}
      {shiftsLoaded && shifts.length > 0 && <DashboardMap shifts={shifts} />}

      {/* Up Next — primary CTA */}
      <UpNextCard
        shifts={shifts}
        loaded={shiftsLoaded}
        directionsOpen={directionsOpen}
        setDirectionsOpen={setDirectionsOpen}
        travellingSince={travellingSince}
        setTravellingSince={setTravellingSince}
        inProgressCount={inProgressCount}
      />

      {/* Break — usable between shifts too, not just during */}
      <BreakCard />

      {/* Library shortcut — count is real */}
      <Link
        href="/library"
        style={{ padding: "14px 16px 22px", textDecoration: "none", display: "block" }}
      >
        <div
          style={{
            background: MC.card,
            borderRadius: MC.radiusCard,
            border: `1px solid ${MC.line}`,
            padding: 14,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: MC.brandTint,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Glyph name="book" size={20} color={MC.brandDeep} />
          </div>
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontFamily: MC.font,
                fontSize: 15,
                fontWeight: 700,
                color: MC.ink,
                letterSpacing: -0.2,
              }}
            >
              Library
            </div>
            <div style={{ fontFamily: MC.font, fontSize: 12.5, color: MC.mute, marginTop: 2 }}>
              {libraryCount === null
                ? "Loading…"
                : libraryCount === 0
                ? "No files yet"
                : `${libraryCount} file${libraryCount === 1 ? "" : "s"}`}
            </div>
          </div>
          <Glyph name="chev-r" size={18} color={MC.hint} />
        </div>
      </Link>

      <AppFooter />
    </div>
  );
}

/**
 * Up Next card — picks the next thing the rep should focus on:
 *   - If they have an in-progress shift → "Resume shift" CTA.
 *   - Else if they have a scheduled shift today → "Check in to shift" CTA.
 *   - Else → empty state nudging /shifts.
 *
 * Shifts come down from the dashboard so we don't double-fetch.
 */
function UpNextCard({
  shifts,
  loaded,
  directionsOpen,
  setDirectionsOpen,
  travellingSince,
  setTravellingSince,
  inProgressCount,
}: {
  shifts: DbShift[];
  loaded: boolean;
  directionsOpen: boolean;
  setDirectionsOpen: (v: boolean) => void;
  travellingSince: number | null;
  setTravellingSince: (v: number | null) => void;
  inProgressCount: number;
}) {
  // Prefer the in-progress shift; otherwise the earliest scheduled one.
  const inProgress = shifts.find((s) => s.state === "in-progress");
  const scheduled = shifts.find((s) => s.state === "scheduled");
  const next = inProgress || scheduled || null;
  const isResume = !!inProgress;
  void inProgressCount; // currently unused; kept for future polish
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!travellingSince) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [travellingSince]);

  const elapsed = travellingSince ? Math.floor((now - travellingSince) / 1000) : 0;
  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  const elapsedLabel = `${m}:${String(s).padStart(2, "0")}`;

  // Empty state: no shift assigned today → nudge them to /shifts to claim one.
  if (loaded && !next) {
    return (
      <div style={{ padding: "12px 16px 0" }}>
        <Link href="/shifts" style={{ textDecoration: "none" }}>
          <div
            style={{
              background: MC.card,
              borderRadius: MC.radiusCard,
              padding: 18,
              border: `1px dashed ${MC.line}`,
              display: "flex",
              alignItems: "center",
              gap: 14,
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: MC.bg,
                border: `1px solid ${MC.line}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Glyph name="clock" size={20} color={MC.mute} />
            </div>
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontFamily: MC.fontDisplay,
                  fontSize: 16,
                  fontWeight: 700,
                  color: MC.ink,
                  letterSpacing: -0.2,
                }}
              >
                No shift assigned today
              </div>
              <div
                style={{
                  fontFamily: MC.font,
                  fontSize: 12.5,
                  color: MC.mute,
                  marginTop: 2,
                }}
              >
                Tap to view available shifts you can claim
              </div>
            </div>
            <Glyph name="chev-r" size={18} color={MC.hint} />
          </div>
        </Link>
      </div>
    );
  }

  // Skeleton while loading
  if (!loaded || !next) return null;

  return (
    <div style={{ padding: "12px 16px 0" }}>
      <div
        style={{
          background: MC.card,
          borderRadius: MC.radiusCard,
          padding: 16,
          boxShadow: "0 1px 2px rgba(10,15,30,.04), 0 8px 24px rgba(10,15,30,.06)",
          border: `1px solid ${travellingSince ? MC.brand + "55" : MC.line}`,
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Soft brand wash when travelling */}
        {travellingSince && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: `linear-gradient(135deg, ${MC.brandTint} 0%, transparent 60%)`,
              pointerEvents: "none",
            }}
          />
        )}

        <div style={{ position: "relative" }}>
          {/* Header row: status pill (UP NEXT or live TRAVELLING) + shift code */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            {travellingSince ? (
              <TravellingPill elapsedLabel={elapsedLabel} />
            ) : (
              <StatusChip tone="brand" icon="sparkle">Up next</StatusChip>
            )}
            <div
              style={{
                fontFamily: MC.font,
                fontSize: 11.5,
                fontWeight: 600,
                color: MC.hint,
                letterSpacing: 0.6,
                textTransform: "uppercase",
              }}
            >
              #{next.code}
            </div>
          </div>

          {/* Customer */}
          <div
            style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 14 }}
          >
            <CustomerTile initials={next.initials} color={next.color} size={48} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontFamily: MC.fontDisplay,
                  fontSize: 18,
                  fontWeight: 700,
                  color: MC.ink,
                  letterSpacing: -0.3,
                  lineHeight: 1.15,
                }}
              >
                {next.name}
              </div>
              <div
                style={{
                  fontFamily: MC.font,
                  fontSize: 13,
                  color: MC.mute,
                  marginTop: 2,
                }}
              >
                {next.start} – {next.end} · {next.distance}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div
            style={{
              marginTop: 14,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            {/* Two-button row: Directions toggles inline preview, Start/Stop travelling */}
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() => setDirectionsOpen(!directionsOpen)}
                style={{
                  ...secondaryBtnStyle,
                  flex: 1,
                  background: directionsOpen ? MC.brandTint : MC.card,
                  borderColor: directionsOpen ? MC.brand : `${MC.brand}33`,
                }}
                aria-pressed={directionsOpen}
              >
                <Glyph
                  name="target"
                  size={16}
                  color={directionsOpen ? MC.brandInk : MC.brandDeep}
                  strokeWidth={2.2}
                />
                Directions
              </button>
              {travellingSince ? (
                <button
                  type="button"
                  onClick={() => setTravellingSince(null)}
                  style={{ ...secondaryBtnStyle, flex: 1.4 }}
                >
                  <Glyph name="pin" size={16} color={MC.brandDeep} strokeWidth={2.2} />
                  Stop · {formatTime(travellingSince)}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setTravellingSince(Date.now())}
                  style={{ ...secondaryBtnStyle, flex: 1.4 }}
                >
                  <Glyph name="pin" size={16} color={MC.brandDeep} strokeWidth={2.2} />
                  Start travelling
                </button>
              )}
            </div>
            {isResume ? (
              <Link href="/active" style={{ textDecoration: "none" }}>
                <PrimaryButton icon="arrow-r">Resume shift</PrimaryButton>
              </Link>
            ) : (
              <Link href={`/check-in?shift=${next.realId}`} style={{ textDecoration: "none" }}>
                <PrimaryButton icon="log">Check in to shift</PrimaryButton>
              </Link>
            )}
          </div>

          {/* Lateness/info banner — only shown for not-yet-checked-in shifts. */}
          {!isResume && (
          <div
            style={{
              marginTop: 12,
              padding: "9px 12px",
              background: MC.warnTint,
              borderRadius: 10,
              display: "flex",
              gap: 8,
              alignItems: "flex-start",
              fontFamily: MC.font,
              fontSize: 12,
              color: "#6d4808",
            }}
          >
            <Glyph name="info" size={14} color="#b27606" />
            <span>
              You&apos;ll record any off-site or late reason at check-in.
            </span>
          </div>
          )}
        </div>
      </div>
    </div>
  );
}

const secondaryBtnStyle: React.CSSProperties = {
  width: "100%",
  height: 46,
  borderRadius: 12,
  background: MC.card,
  color: MC.brandDeep,
  border: `1px solid ${MC.brand}33`,
  fontFamily: MC.font,
  fontSize: 14,
  fontWeight: 600,
  letterSpacing: -0.1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  cursor: "pointer",
};

/**
 * BreakCard — compact "Take a break" affordance on the dashboard. Independent
 * of any active shift; reps can use this between shifts. When active,
 * replaces with a live break timer + Complete button.
 */
function BreakCard() {
  const PURPLE = "#5b3da5";
  const PURPLE_TINT = "#EDE7F8";
  const [breakSince, setBreakSince] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!breakSince) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [breakSince]);
  const elapsed = breakSince ? Math.floor((now - breakSince) / 1000) : 0;
  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;

  return (
    <div style={{ padding: "12px 16px 0" }}>
      {breakSince === null ? (
        <button
          type="button"
          onClick={() => setBreakSince(Date.now())}
          style={{
            width: "100%",
            background: MC.card,
            border: `1px solid ${MC.line}`,
            borderRadius: MC.radiusCard,
            padding: 14,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 12,
            textAlign: "left",
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: PURPLE_TINT,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Glyph name="clock" size={20} color={PURPLE} strokeWidth={2.2} />
          </div>
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontFamily: MC.font,
                fontSize: 15,
                fontWeight: 700,
                color: MC.ink,
                letterSpacing: -0.2,
              }}
            >
              Take a break
            </div>
            <div
              style={{
                fontFamily: MC.font,
                fontSize: 12.5,
                color: MC.mute,
                marginTop: 2,
              }}
            >
              Pause your day · 15 min, 30 min or custom
            </div>
          </div>
          <Glyph name="chev-r" size={18} color={MC.hint} />
        </button>
      ) : (
        <div
          style={{
            background: MC.card,
            border: `1px solid ${PURPLE}55`,
            borderRadius: MC.radiusCard,
            padding: 16,
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: `linear-gradient(135deg, ${PURPLE_TINT} 0%, transparent 70%)`,
              pointerEvents: "none",
            }}
          />
          <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 14,
                background: PURPLE,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                boxShadow: `0 6px 16px ${PURPLE}55`,
              }}
            >
              <Glyph name="clock" size={20} color="#fff" strokeWidth={2.2} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontFamily: MC.font,
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: 0.8,
                  textTransform: "uppercase",
                  color: PURPLE,
                }}
              >
                On break
              </div>
              <div
                style={{
                  fontFamily: MC.fontDisplay,
                  fontSize: 22,
                  fontWeight: 700,
                  color: MC.ink,
                  letterSpacing: -0.5,
                  lineHeight: 1.05,
                  marginTop: 2,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {m}:{String(s).padStart(2, "0")}
              </div>
              <div
                style={{
                  fontFamily: MC.font,
                  fontSize: 12,
                  color: MC.mute,
                  marginTop: 2,
                }}
              >
                started {formatTime(breakSince)}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setBreakSince(null)}
              style={{
                background: PURPLE,
                color: "#fff",
                border: "none",
                padding: "10px 14px",
                borderRadius: 11,
                cursor: "pointer",
                fontFamily: MC.font,
                fontSize: 13,
                fontWeight: 600,
                letterSpacing: -0.1,
                boxShadow: `0 4px 12px ${PURPLE}55`,
              }}
            >
              Complete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function TravellingPill({ elapsedLabel }: { elapsedLabel: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        background: MC.brand,
        color: "#fff",
        fontFamily: MC.font,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 0.4,
        textTransform: "uppercase",
        padding: "4px 10px",
        borderRadius: 999,
        boxShadow: `0 4px 12px ${MC.brand}55`,
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: "#fff",
          position: "relative",
        }}
      >
        <span
          style={{
            position: "absolute",
            inset: -3,
            borderRadius: "50%",
            border: "1.5px solid #fff",
            opacity: 0.5,
            animation: "mc-pulse 1.6s ease-out infinite",
          }}
        />
      </span>
      Travelling ·{" "}
      <span style={{ fontVariantNumeric: "tabular-nums", marginLeft: 2 }}>
        {elapsedLabel}
      </span>
    </span>
  );
}

