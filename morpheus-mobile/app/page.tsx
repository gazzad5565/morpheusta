"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { MC } from "@/lib/tokens";
import { SAMPLE, type Shift } from "@/lib/mock-data";
import { AppHeader, AppFooter, CustomerTile, StatusChip, PrimaryButton } from "@/components/Chrome";
import { Glyph, formatTime } from "@/components/Glyph";
import { getUser } from "@/lib/auth";
import { listMyShiftsToday } from "@/lib/shifts-store";
import { getMyProfile } from "@/lib/profiles-store";

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
  // Lifted state — both Up Next and the map react to these.
  // directionsOpen: rep tapped "Directions" to preview the route on the map.
  // travellingSince: rep tapped "Start travelling" — route is now live.
  // The map shows the route view when EITHER is active.
  const [directionsOpen, setDirectionsOpen] = useState(false);
  const [travellingSince, setTravellingSince] = useState<number | null>(null);

  // Greeting prefers the profiles.name (set on signup), falls back to email.
  const [displayName, setDisplayName] = useState<string>("");
  useEffect(() => {
    let cancelled = false;
    Promise.all([getMyProfile(), getUser()]).then(([profile, user]) => {
      if (cancelled) return;
      // Prefer profile.name, then derive from email
      const fromProfile = profile?.name?.trim();
      setDisplayName(fromProfile || nameFromEmail(user?.email));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div style={{ background: MC.bg, minHeight: "100%" }}>
      <AppHeader title="Dashboard" lastSync="02:12 PM" />

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
          Thu · 23 Apr 2026
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

      {/* Shifts-today summary */}
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
              {SAMPLE.shifts.length}
            </div>
            <div style={{ fontFamily: MC.font, fontSize: 14, fontWeight: 500, color: MC.mute }}>
              shifts today
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
        <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
          {SAMPLE.shifts.map((_s, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: 5,
                borderRadius: 999,
                background: i === 0 ? MC.brand : "#DCE0E6",
              }}
            />
          ))}
        </div>
      </div>

      {/* Today's route — all shift locations plotted; reacts to directions + travel state */}
      <TodaysRouteMap
        showRoute={directionsOpen || travellingSince !== null}
        isTravelling={travellingSince !== null}
      />

      {/* Up Next — controls directions + travel state */}
      <UpNextCard
        directionsOpen={directionsOpen}
        setDirectionsOpen={setDirectionsOpen}
        travellingSince={travellingSince}
        setTravellingSince={setTravellingSince}
      />

      {/* Break — usable between shifts too, not just during */}
      <BreakCard />

      {/* Library shortcut */}
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
              2 new files
            </div>
          </div>
          <Glyph name="chev-r" size={18} color={MC.hint} />
        </div>
      </Link>

      {/* Yesterday — tucked below Library as low-priority info, visually demoted */}
      <YesterdayCard />

      <AppFooter />
    </div>
  );
}

/**
 * Up Next card — shows the rep's next shift with two stacked actions:
 * Start travelling (precursor) and Check in to shift (primary). When
 * travelling is active, the top "UP NEXT" pill flips to a live travelling
 * pill with elapsed time and a Stop affordance.
 */
function UpNextCard({
  directionsOpen,
  setDirectionsOpen,
  travellingSince,
  setTravellingSince,
}: {
  directionsOpen: boolean;
  setDirectionsOpen: (v: boolean) => void;
  travellingSince: number | null;
  setTravellingSince: (v: number | null) => void;
}) {
  // Pull the rep's next assigned shift from the DB on mount. realId is the
  // shift's database UUID — passed to /check-in so the right row gets updated.
  const [next, setNext] = useState<(Shift & { realId: string }) | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    listMyShiftsToday().then((rows) => {
      if (cancelled) return;
      setNext(rows[0] || null);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);
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
            <Link href={`/check-in?shift=${next.realId}`} style={{ textDecoration: "none" }}>
              <PrimaryButton icon="log">Check in to shift</PrimaryButton>
            </Link>
          </div>

          {/* Distance/lateness warning */}
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
              You&apos;re <b>3 km</b> from site. You&apos;ll need to record a reason at check-in.
            </span>
          </div>
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

/**
 * TodaysRouteMap — abstract map card with all shift locations plotted as
 * colored pins, plus the rep's current location. Visual at-a-glance of "where
 * you'll be today". Faux map (no tiles, no external deps).
 *
 * When `travellingSince` is set, the map enters an "en route" state: the
 * destination pin (next shift) glows, other pins fade, the route line
 * thickens and animates, and the bottom summary pill flips to a live ETA.
 */
function TodaysRouteMap({
  showRoute,
  isTravelling,
}: {
  showRoute: boolean;
  isTravelling: boolean;
}) {
  // Hand-placed pin coordinates within the map (% of width/height).
  // Spread so they look like four sites scattered across a city/region.
  const pins = [
    { shift: SAMPLE.shifts[0], x: 28, y: 32, order: 1 }, // GreenWave (destination)
    { shift: SAMPLE.shifts[1], x: 64, y: 26, order: 2 }, // NextGen
    { shift: SAMPLE.shifts[2], x: 76, y: 64, order: 3 }, // Optima
    { shift: SAMPLE.shifts[3], x: 42, y: 76, order: 4 }, // SiteB
  ];
  // User position
  const userX = 50;
  const userY = 52;
  const destination = pins[0];

  return (
    <div style={{ padding: "12px 16px 0" }}>
      <div
        style={{
          background: MC.card,
          borderRadius: MC.radiusCard,
          border: `1px solid ${MC.line}`,
          overflow: "hidden",
          boxShadow: "0 1px 2px rgba(10,15,30,.04)",
        }}
      >
        {/* Map area */}
        <div
          style={{
            position: "relative",
            height: 180,
            background: "linear-gradient(170deg, #DCEBEE 0%, #E5EFE3 70%, #EAEEDF 100%)",
          }}
        >
          {/* Stylised park / water blobs */}
          <svg
            viewBox="0 0 400 180"
            preserveAspectRatio="none"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
          >
            {/* water */}
            <path
              d="M260,0 Q360,20 400,60 L400,0 Z"
              fill="#B6D9E7"
              opacity="0.55"
            />
            {/* parks */}
            <ellipse cx="120" cy="140" rx="50" ry="22" fill="#9DC59A" opacity="0.45" />
            <ellipse cx="320" cy="120" rx="34" ry="18" fill="#9DC59A" opacity="0.4" />
            {/* roads */}
            <path
              d="M0,90 Q100,70 200,95 T400,80"
              stroke="#fff"
              strokeWidth="5"
              fill="none"
              opacity=".85"
            />
            <path
              d="M40,0 Q70,80 100,180"
              stroke="#fff"
              strokeWidth="3"
              fill="none"
              opacity=".7"
            />
            <path
              d="M280,0 L260,180"
              stroke="#fff"
              strokeWidth="3"
              fill="none"
              opacity=".7"
            />
            <path
              d="M0,140 Q200,130 400,150"
              stroke="#fff"
              strokeWidth="3"
              fill="none"
              opacity=".6"
            />
          </svg>

          {/* Route line — thicker when route view is shown; flows only when travelling */}
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
          >
            <line
              x1={userX}
              y1={userY}
              x2={destination.x}
              y2={destination.y}
              stroke={destination.shift.color}
              strokeWidth={showRoute ? "1.2" : "0.6"}
              strokeDasharray={showRoute ? "3 2" : "2 2"}
              strokeLinecap="round"
              opacity={showRoute ? 1 : 0.85}
              style={
                isTravelling
                  ? { animation: "mc-flow 0.8s linear infinite" }
                  : undefined
              }
            />
          </svg>

          {/* Customer pins — non-destination pins fade when route is shown */}
          {pins.map((p) => {
            const isDestination = p.shift.id === destination.shift.id;
            return (
              <ShiftPin
                key={p.shift.id}
                x={p.x}
                y={p.y}
                order={p.order}
                color={p.shift.color}
                initials={p.shift.initials}
                fade={showRoute && !isDestination}
                glow={isTravelling && isDestination}
              />
            );
          })}

          {/* User dot */}
          <UserDot x={userX} y={userY} />

          {/* Bottom-left summary pill — three states: overview / preview / travelling */}
          {isTravelling ? (
            <div
              style={{
                position: "absolute",
                bottom: 10,
                left: 10,
                background: destination.shift.color,
                color: "#fff",
                padding: "6px 11px",
                borderRadius: 999,
                fontFamily: MC.font,
                fontSize: 11.5,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                gap: 8,
                boxShadow: `0 4px 14px ${destination.shift.color}66`,
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
              <span style={{ letterSpacing: 0.5, textTransform: "uppercase" }}>
                En route
              </span>
              <span style={{ opacity: 0.6 }}>·</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>~ 8 min</span>
            </div>
          ) : showRoute ? (
            <div
              style={{
                position: "absolute",
                bottom: 10,
                left: 10,
                background: "#fff",
                color: MC.ink,
                padding: "6px 11px",
                borderRadius: 999,
                fontFamily: MC.font,
                fontSize: 11.5,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                gap: 8,
                border: `1px solid ${destination.shift.color}55`,
                boxShadow: "0 2px 6px rgba(0,0,0,.08)",
              }}
            >
              <Glyph
                name="pin"
                size={12}
                color={destination.shift.color}
                strokeWidth={2.2}
              />
              <span style={{ letterSpacing: 0.5, textTransform: "uppercase" }}>
                Preview
              </span>
              <span style={{ opacity: 0.4 }}>·</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>3 km · 8 min</span>
            </div>
          ) : (
            <div
              style={{
                position: "absolute",
                bottom: 10,
                left: 10,
                background: "rgba(23,26,31,.92)",
                color: "#fff",
                padding: "6px 11px",
                borderRadius: 999,
                fontFamily: MC.font,
                fontSize: 11.5,
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: 8,
                backdropFilter: "blur(8px)",
              }}
            >
              <Glyph name="pin" size={12} color="#fff" strokeWidth={2.2} />
              <span>{pins.length} shifts today</span>
              <span style={{ opacity: 0.5 }}>·</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>17 km total</span>
            </div>
          )}

          {/* Top-right eyebrow */}
          <div
            style={{
              position: "absolute",
              top: 10,
              right: 10,
              background: "#fff",
              padding: "5px 10px",
              borderRadius: 999,
              fontFamily: MC.font,
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: 0.5,
              textTransform: "uppercase",
              color: showRoute ? destination.shift.color : MC.mute,
              boxShadow: "0 2px 6px rgba(0,0,0,.08)",
            }}
          >
            {isTravelling
              ? `→ ${destination.shift.initials}`
              : showRoute
              ? `Directions · ${destination.shift.initials}`
              : "Today’s route"}
          </div>
        </div>
      </div>
    </div>
  );
}

function ShiftPin({
  x,
  y,
  order,
  color,
  initials,
  fade,
  glow,
}: {
  x: number;
  y: number;
  order: number;
  color: string;
  initials: string;
  fade?: boolean;
  glow?: boolean;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: `${x}%`,
        top: `${y}%`,
        transform: "translate(-50%, -100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        opacity: fade ? 0.35 : 1,
        transition: "opacity .25s ease",
        zIndex: glow ? 2 : 1,
      }}
    >
      <div
        style={{
          padding: "3px 7px",
          background: color,
          color: "#fff",
          fontFamily: MC.font,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 0.3,
          borderRadius: 4,
          marginBottom: 2,
          boxShadow: glow
            ? `0 2px 6px rgba(0,0,0,.25), 0 0 0 3px ${color}33, 0 0 0 6px ${color}1A`
            : "0 2px 6px rgba(0,0,0,.25)",
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        <span
          style={{
            width: 14,
            height: 14,
            borderRadius: "50%",
            background: "rgba(255,255,255,.25)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 9,
            fontWeight: 800,
          }}
        >
          {order}
        </span>
        {initials}
      </div>
      <div style={{ position: "relative", width: 22, height: 26 }}>
        {glow && (
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: 11,
              transform: "translate(-50%, -50%)",
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: `${color}40`,
              animation: "mc-map-pulse 1.6s ease-out infinite",
            }}
          />
        )}
        <svg width="22" height="26" viewBox="0 0 22 26" style={{ position: "relative" }}>
          <path
            d="M11 25 Q4 17 4 11 a7 7 0 1 1 14 0 Q18 17 11 25z"
            fill={color}
            stroke="#fff"
            strokeWidth="2"
          />
          <circle cx="11" cy="11" r="3" fill="#fff" />
        </svg>
      </div>
    </div>
  );
}

function UserDot({ x, y }: { x: number; y: number }) {
  return (
    <div
      style={{
        position: "absolute",
        left: `${x}%`,
        top: `${y}%`,
        transform: "translate(-50%, -50%)",
        width: 28,
        height: 28,
        borderRadius: "50%",
        background: `${MC.brand}33`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          border: `2px solid ${MC.brand}`,
          animation: "mc-map-pulse 1.6s ease-out infinite",
        }}
      />
      <div
        style={{
          width: 12,
          height: 12,
          borderRadius: "50%",
          background: MC.brand,
          border: "2px solid #fff",
          boxShadow: "0 0 0 1px rgba(0,0,0,.15)",
        }}
      />
    </div>
  );
}

/**
 * YesterdayCard — low-priority "history" info row. Sits below Library at the
 * bottom of the dashboard. Flat (no card chrome), preceded by a thin divider
 * + eyebrow label so it reads as informational, not actionable.
 */
function YesterdayCard() {
  // In Phase 2 these come from the API.
  const visitsCount = 4;
  const totalTimeLabel = "8h 47m";

  return (
    <div style={{ padding: "16px 24px 24px" }}>
      {/* Eyebrow with hairlines either side */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 12,
        }}
      >
        <div style={{ flex: 1, height: 1, background: MC.line, opacity: 0.7 }} />
        <div
          style={{
            fontFamily: MC.font,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 1.2,
            textTransform: "uppercase",
            color: MC.hint,
          }}
        >
          Recent
        </div>
        <div style={{ flex: 1, height: 1, background: MC.line, opacity: 0.7 }} />
      </div>

      {/* Flat row, no card background — just info */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "4px 4px",
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: MC.bg,
            border: `1px solid ${MC.line}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Glyph name="clock" size={15} color={MC.mute} strokeWidth={2} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: MC.font,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 0.8,
              textTransform: "uppercase",
              color: MC.hint,
            }}
          >
            Yesterday
          </div>
          <div
            style={{
              fontFamily: MC.font,
              fontSize: 12.5,
              color: MC.mute,
              fontWeight: 500,
              marginTop: 2,
              display: "flex",
              alignItems: "center",
              gap: 6,
              flexWrap: "wrap",
            }}
          >
            <span>{visitsCount} visits</span>
            <span style={{ color: MC.hint, opacity: 0.4 }}>·</span>
            <span>{totalTimeLabel} worked</span>
          </div>
        </div>
        <Glyph name="chev-r" size={14} color={MC.hint} />
      </div>
    </div>
  );
}
