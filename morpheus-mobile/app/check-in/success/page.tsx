"use client";

/**
 * /check-in/success — confirmation screen after a successful check-in.
 *
 * Reads everything from URL params (passed by /check-in on success):
 *   - customer        : human-readable customer name
 *   - shift           : real shifts.id (used to find the next shift)
 *   - checkInAt       : "HH:MM AM/PM" wall-clock time of the check-in
 *   - offsiteDistanceM: distance from site, only present if off-site fired
 *   - lateMinutes     : minutes late, only present if late fired
 *   - earlyMinutes    : minutes early, only present if early fired
 *   - locationReason  : rep's reason chip selection (off-site)
 *   - locationNote    : optional note (off-site)
 *   - lateReason / lateNote
 *   - earlyReason / earlyNote
 *
 * Renders only the exception cards that actually fired. If none fired,
 * shows a clean "All clear" body. The next-shift block is live-loaded
 * from listMyShiftsToday() and shows whichever scheduled shift comes
 * after the one you just checked into — hidden if there isn't one.
 */

import { useEffect, useState, Suspense, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { MC } from "@/lib/tokens";
import { AppHeader, AppFooter, CustomerTile, PrimaryButton } from "@/components/Chrome";
import { Glyph, type GlyphName } from "@/components/Glyph";
import { listMyShiftsToday } from "@/lib/shifts-store";
import type { Shift } from "@/lib/mock-data";

type DbShift = Shift & {
  realId: string;
  state: string;
  checkInAt: string | null;
};

export default function SuccessPageWrapper() {
  return (
    <Suspense fallback={null}>
      <SuccessPage />
    </Suspense>
  );
}

function formatLatenessShort(mins: number): string {
  const m = Math.round(mins);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm === 0 ? `${h}h` : `${h}h ${mm}m`;
}

function formatDistanceShort(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(meters < 10000 ? 2 : 1)} km`;
}

function SuccessPage() {
  const router = useRouter();
  const params = useSearchParams();

  const customerName = params.get("customer") || "your shift";
  const shiftId = params.get("shift") || "";
  const checkInAt = params.get("checkInAt") || "";

  const offsiteDistanceM = parseInt(params.get("offsiteDistanceM") || "", 10);
  const lateMinutes = parseInt(params.get("lateMinutes") || "", 10);
  const earlyMinutes = parseInt(params.get("earlyMinutes") || "", 10);

  const locationReason = params.get("locationReason") || "";
  const locationNote = params.get("locationNote") || "";
  const lateReason = params.get("lateReason") || "";
  const lateNote = params.get("lateNote") || "";
  const earlyReason = params.get("earlyReason") || "";
  const earlyNote = params.get("earlyNote") || "";

  const offsiteFired = !Number.isNaN(offsiteDistanceM);
  const lateFired = !Number.isNaN(lateMinutes) && lateMinutes > 0;
  const earlyFired = !Number.isNaN(earlyMinutes) && earlyMinutes > 0;
  const anyException = offsiteFired || lateFired || earlyFired;

  // Find the next scheduled shift after the one we just checked into.
  // Pulled live from listMyShiftsToday so a manager-assigned later
  // shift shows up correctly even if it landed after this page mounted.
  const [todayShifts, setTodayShifts] = useState<DbShift[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    listMyShiftsToday().then((rows) => {
      if (!cancelled) setTodayShifts(rows as DbShift[]);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const nextShift = useMemo<DbShift | null>(() => {
    if (!todayShifts) return null;
    // Find the shift we just checked into (state should now be in-progress).
    const current = todayShifts.find((s) => s.realId === shiftId);
    if (!current) {
      // Fall back: pick the next "scheduled" shift on the day.
      return (
        todayShifts
          .filter((s) => s.state === "scheduled")
          .sort((a, b) => a.start.localeCompare(b.start))[0] || null
      );
    }
    // Pick the earliest scheduled shift whose start_time > current.start
    return (
      todayShifts
        .filter((s) => s.state === "scheduled" && s.start > current.start)
        .sort((a, b) => a.start.localeCompare(b.start))[0] || null
    );
  }, [todayShifts, shiftId]);

  return (
    <div
      style={{
        background: MC.bg,
        minHeight: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Animation keyframes scoped to this page. Drive a one-shot
          celebration sequence: ring pulses outward, halo + disc pop
          in, the checkmark draws itself stroke-by-stroke, and the
          content below staggers up. Plays once on mount, no repeat. */}
      <style>{`
        @keyframes ci-pop {
          0%   { transform: scale(0); opacity: 0; }
          60%  { transform: scale(1.08); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes ci-ring {
          0%   { transform: translate(-50%, -50%) scale(0.85); opacity: 0.75; }
          100% { transform: translate(-50%, -50%) scale(2.4);  opacity: 0; }
        }
        @keyframes ci-draw {
          to { stroke-dashoffset: 0; }
        }
        @keyframes ci-fade-up {
          0%   { opacity: 0; transform: translateY(10px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .ci-fade-up { animation: ci-fade-up .42s cubic-bezier(.22, 1, .36, 1) both; }
        .ci-stage { animation: ci-pop .42s cubic-bezier(.34, 1.6, .64, 1) both; }
        .ci-ring  { animation: ci-ring 1.6s cubic-bezier(.16, 1, .3, 1) .15s both; }
        .ci-ring-2 { animation-delay: .45s; }
        .ci-ring-3 { animation-delay: .75s; }
        .ci-check-path {
          stroke-dasharray: 28;
          stroke-dashoffset: 28;
          animation: ci-draw .38s cubic-bezier(.65, 0, .35, 1) .28s both;
        }
        @media (prefers-reduced-motion: reduce) {
          .ci-stage, .ci-ring, .ci-check-path, .ci-fade-up {
            animation: none !important;
          }
          .ci-check-path { stroke-dashoffset: 0; }
        }
      `}</style>

      <AppHeader title="Checked in" onBack={() => router.push("/")} />

      <div
        style={{
          flex: 1,
          padding: "28px 20px 20px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        {/* Animated celebration stage. Three rings pulse outward from
            the center, a soft halo + brand disc pop in, and the
            checkmark draws itself in. */}
        <div
          style={{
            position: "relative",
            width: 160,
            height: 160,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* Pulsing rings — absolutely positioned + transform-origin
              center via the translate(-50%,-50%) trick. */}
          {[1, 2, 3].map((i) => (
            <span
              key={i}
              className={`ci-ring ci-ring-${i}`}
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                width: 104,
                height: 104,
                borderRadius: "50%",
                border: `2px solid ${MC.brand}`,
                pointerEvents: "none",
              }}
              aria-hidden
            />
          ))}

          {/* Halo + disc + animated check */}
          <div
            className="ci-stage"
            style={{
              width: 104,
              height: 104,
              borderRadius: "50%",
              background:
                "radial-gradient(circle at 30% 30%, #E3F6FB 0%, #B7E6F2 70%, #8FD4E6 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: `0 20px 40px ${MC.brand}40`,
              position: "relative",
            }}
          >
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: "50%",
                background: MC.brand,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg
                width={38}
                height={38}
                viewBox="0 0 24 24"
                fill="none"
                stroke="#fff"
                strokeWidth={2.6}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path className="ci-check-path" d="M5 12 L10 17 L19 8" />
              </svg>
            </div>
          </div>
        </div>

        <div
          className="ci-fade-up"
          style={{
            animationDelay: ".42s",
            fontFamily: MC.fontDisplay,
            fontSize: 24,
            fontWeight: 700,
            color: MC.ink,
            letterSpacing: -0.4,
            marginTop: 20,
            textAlign: "center",
          }}
        >
          You&apos;re checked in
        </div>
        <div
          className="ci-fade-up"
          style={{
            animationDelay: ".55s",
            fontFamily: MC.font,
            fontSize: 14,
            color: MC.mute,
            marginTop: 6,
            textAlign: "center",
            maxWidth: 320,
            lineHeight: 1.5,
          }}
        >
          Shift at <b style={{ color: MC.ink }}>{customerName}</b>
          {checkInAt ? <> started at <b style={{ color: MC.ink }}>{checkInAt}</b></> : null}
          .
          {anyException && " Your reasons were sent to your manager."}
        </div>

        {/* Exception cards — render only the ones that actually fired. */}
        {anyException && (
          <div
            className="ci-fade-up"
            style={{
              animationDelay: ".7s",
              width: "100%",
              background: MC.card,
              border: `1px solid ${MC.line}`,
              borderRadius: MC.radiusCard,
              padding: 14,
              marginTop: 22,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            {offsiteFired && (
              <SummaryRow
                iconTone={MC.dangerTint}
                iconColor={MC.danger}
                iconName="pin"
                title={`Off-site by ${formatDistanceShort(offsiteDistanceM)}`}
                value={locationReason || "Reason not given"}
                note={locationNote}
              />
            )}
            {lateFired && (
              <>
                {offsiteFired && <Divider />}
                <SummaryRow
                  iconTone={MC.warnTint}
                  iconColor="#b27606"
                  iconName="clock"
                  title={`Late by ${formatLatenessShort(lateMinutes)}`}
                  value={lateReason || "Reason not given"}
                  note={lateNote}
                />
              </>
            )}
            {earlyFired && (
              <>
                {(offsiteFired || lateFired) && <Divider />}
                <SummaryRow
                  iconTone={MC.warnTint}
                  iconColor="#b27606"
                  iconName="clock"
                  title={`Early by ${formatLatenessShort(earlyMinutes)}`}
                  value={earlyReason || "Reason not given"}
                  note={earlyNote}
                />
              </>
            )}
          </div>
        )}

        {/* Next shift — live from the DB, hidden if there isn't one. */}
        {nextShift && (
          <Link
            href={`/check-in?shift=${nextShift.realId}`}
            className="ci-fade-up"
            style={{
              animationDelay: ".85s",
              width: "100%",
              textDecoration: "none",
              marginTop: 16,
            }}
          >
            <div
              style={{
                width: "100%",
                padding: 14,
                background: MC.card,
                border: `1px solid ${MC.line}`,
                borderRadius: MC.radiusCard,
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              <CustomerTile
                initials={nextShift.initials}
                color={nextShift.color}
                size={40}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: MC.font,
                    fontSize: 11,
                    color: MC.hint,
                    fontWeight: 600,
                    letterSpacing: 0.6,
                    textTransform: "uppercase",
                  }}
                >
                  Next shift
                </div>
                <div
                  style={{
                    fontFamily: MC.fontDisplay,
                    fontSize: 15,
                    fontWeight: 700,
                    color: MC.ink,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {nextShift.name}
                </div>
                <div
                  style={{
                    fontFamily: MC.font,
                    fontSize: 12,
                    color: MC.mute,
                    marginTop: 1,
                  }}
                >
                  {nextShift.start} – {nextShift.end}
                </div>
              </div>
              <Glyph name="chev-r" size={18} color={MC.mute} />
            </div>
          </Link>
        )}
      </div>

      <div
        className="ci-fade-up"
        style={{ animationDelay: "1s", padding: "0 16px 18px" }}
      >
        <PrimaryButton onClick={() => router.push("/active")} icon="arrow-r">
          Start activities
        </PrimaryButton>
      </div>

      <AppFooter />
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: MC.line }} />;
}

function SummaryRow({
  iconTone,
  iconColor,
  iconName,
  title,
  value,
  note,
}: {
  iconTone: string;
  iconColor: string;
  iconName: GlyphName;
  title: string;
  value: string;
  note?: string;
}) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: iconTone,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Glyph name={iconName} size={16} color={iconColor} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: MC.font,
            fontSize: 12,
            fontWeight: 600,
            color: MC.mute,
            textTransform: "uppercase",
            letterSpacing: 0.6,
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontFamily: MC.font,
            fontSize: 14,
            fontWeight: 600,
            color: MC.ink,
            marginTop: 2,
          }}
        >
          {value}
        </div>
        {note && (
          <div
            style={{
              marginTop: 6,
              padding: "8px 10px",
              background: MC.bg,
              borderRadius: 8,
              fontFamily: MC.font,
              fontSize: 12.5,
              color: MC.ink2,
            }}
          >
            &ldquo;{note}&rdquo;
          </div>
        )}
      </div>
    </div>
  );
}
