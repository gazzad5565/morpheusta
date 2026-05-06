"use client";

/**
 * Chart primitives for the /reports views.
 *
 * No charting library — just hand-rolled SVG. Two reasons: (1) keeps
 * the bundle small (a single chart lib is 50-200kB), (2) we only need
 * three shapes (line, bar, donut) and they're each ~80 LOC.
 *
 * Every chart is responsive via viewBox + width:100%, accepts any
 * design-token colour, and renders an empty-state message when given
 * zero rows so a fresh DB doesn't show a broken chart.
 */

import { AC } from "@/lib/tokens";

// ─── Tokens ─────────────────────────────────────────────────────────────

export const CHART_PALETTE = [
  AC.brand,
  AC.ok,
  AC.warn,
  AC.danger,
  "#8E4ECC",
  "#2E9C82",
  "#5B7DC2",
  "#C55A2E",
];

// Use this to keep all chart text typography consistent.
const CHART_FONT = AC.font;

// ─── KpiBig — large number with optional delta ──────────────────────────

export function KpiBig({
  label,
  value,
  sub,
  delta,
  tone = "ink",
}: {
  label: string;
  value: string;
  sub?: string;
  /** "+8.4%", "-12 pts", "0", null → no delta shown */
  delta?: string | null;
  tone?: "ink" | "ok" | "warn" | "danger" | "brand";
}) {
  const valueColor =
    tone === "ok"
      ? AC.ok
      : tone === "warn"
      ? AC.warn
      : tone === "danger"
      ? AC.danger
      : tone === "brand"
      ? AC.brandDeep
      : AC.ink;
  const deltaTone =
    delta && delta.startsWith("-")
      ? AC.danger
      : delta && delta.startsWith("+")
      ? AC.ok
      : AC.mute;
  return (
    <div
      style={{
        background: "#fff",
        border: `1px solid ${AC.line}`,
        borderRadius: AC.radiusCard,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 4,
        minHeight: 100,
      }}
    >
      <div
        style={{
          fontFamily: CHART_FONT,
          fontSize: 11,
          fontWeight: 700,
          color: AC.mute,
          letterSpacing: 0.4,
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <div
          style={{
            fontFamily: CHART_FONT,
            fontSize: 30,
            fontWeight: 700,
            color: valueColor,
            letterSpacing: -0.8,
            lineHeight: 1,
          }}
        >
          {value}
        </div>
        {delta && (
          <div
            style={{
              fontFamily: CHART_FONT,
              fontSize: 11.5,
              fontWeight: 700,
              color: deltaTone,
              letterSpacing: -0.1,
            }}
          >
            {delta}
          </div>
        )}
      </div>
      {sub && (
        <div
          style={{
            fontFamily: CHART_FONT,
            fontSize: 11.5,
            color: AC.mute,
            fontWeight: 500,
            marginTop: 2,
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

// ─── LineChart — multi-series ───────────────────────────────────────────

export interface LineSeries {
  name: string;
  color: string;
  values: number[];
}

export function LineChart({
  labels,
  series,
  height = 220,
  yFormat,
  yMaxOverride,
}: {
  labels: string[];
  series: LineSeries[];
  height?: number;
  yFormat?: (n: number) => string;
  /** Force the y-axis maximum (e.g. 100 for percentage charts). */
  yMaxOverride?: number;
}) {
  const W = 800;
  const H = height;
  const PAD_L = 40;
  const PAD_R = 16;
  const PAD_T = 12;
  const PAD_B = 28;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  const allValues = series.flatMap((s) => s.values);
  const dataMax = allValues.length ? Math.max(...allValues) : 0;
  const yMax = Math.max(1, yMaxOverride ?? Math.ceil(dataMax * 1.1));
  const n = labels.length;

  if (n === 0 || series.length === 0) {
    return <ChartEmpty height={H} />;
  }

  const xAt = (i: number) =>
    n === 1 ? PAD_L + innerW / 2 : PAD_L + (i * innerW) / (n - 1);
  const yAt = (v: number) => PAD_T + innerH - (v / yMax) * innerH;

  // 4 horizontal gridlines.
  const gridYs = [0, yMax / 4, yMax / 2, (3 * yMax) / 4, yMax];

  const fmt = yFormat ?? ((v: number) => String(Math.round(v)));

  // Show every label if ≤8, otherwise every Nth.
  const labelStep = Math.max(1, Math.ceil(n / 8));

  return (
    <div style={{ width: "100%" }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: "auto", display: "block" }}
        aria-label="Line chart"
      >
        {/* Gridlines + y labels */}
        {gridYs.map((g, i) => (
          <g key={i}>
            <line
              x1={PAD_L}
              x2={W - PAD_R}
              y1={yAt(g)}
              y2={yAt(g)}
              stroke={AC.lineDim}
              strokeDasharray={i === 0 ? undefined : "3 3"}
            />
            <text
              x={PAD_L - 6}
              y={yAt(g) + 3}
              textAnchor="end"
              fontFamily={CHART_FONT}
              fontSize={9.5}
              fill={AC.mute}
            >
              {fmt(g)}
            </text>
          </g>
        ))}

        {/* X labels */}
        {labels.map((l, i) =>
          i % labelStep === 0 || i === n - 1 ? (
            <text
              key={i}
              x={xAt(i)}
              y={H - PAD_B + 14}
              textAnchor="middle"
              fontFamily={CHART_FONT}
              fontSize={9.5}
              fill={AC.mute}
            >
              {l}
            </text>
          ) : null
        )}

        {/* Series */}
        {series.map((s) => {
          if (s.values.length === 0) return null;
          const path = s.values
            .map((v, i) => `${i === 0 ? "M" : "L"} ${xAt(i)} ${yAt(v)}`)
            .join(" ");
          // Soft area fill under the line.
          const area =
            n > 1
              ? `M ${xAt(0)} ${yAt(0)} ${s.values
                  .map((v, i) => `L ${xAt(i)} ${yAt(v)}`)
                  .join(" ")} L ${xAt(n - 1)} ${yAt(0)} Z`
              : "";
          return (
            <g key={s.name}>
              {area && (
                <path d={area} fill={s.color} opacity={0.08} />
              )}
              <path
                d={path}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {s.values.map((v, i) => (
                <circle
                  key={i}
                  cx={xAt(i)}
                  cy={yAt(v)}
                  r={2.5}
                  fill={s.color}
                />
              ))}
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      {series.length > 1 && (
        <div
          style={{
            display: "flex",
            gap: 14,
            justifyContent: "center",
            marginTop: 6,
            flexWrap: "wrap",
          }}
        >
          {series.map((s) => (
            <div
              key={s.name}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontFamily: CHART_FONT,
                fontSize: 11.5,
                color: AC.ink2,
                fontWeight: 600,
              }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 99,
                  background: s.color,
                }}
              />
              {s.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── BarChart (horizontal) — for leaderboards ───────────────────────────

export function BarChart({
  rows,
  valueLabel,
  maxOverride,
  height,
}: {
  rows: { label: string; value: number; color?: string; sub?: string }[];
  valueLabel?: (n: number) => string;
  maxOverride?: number;
  /** Optional fixed total height; else sized to content. */
  height?: number;
}) {
  if (rows.length === 0) {
    return <ChartEmpty height={height ?? 160} />;
  }
  const max = Math.max(1, maxOverride ?? Math.max(...rows.map((r) => r.value)));
  const fmt = valueLabel ?? ((n: number) => String(Math.round(n)));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {rows.map((r, i) => {
        const pct = (r.value / max) * 100;
        const color = r.color || CHART_PALETTE[i % CHART_PALETTE.length];
        return (
          <div key={i}>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: 8,
                marginBottom: 4,
              }}
            >
              <div
                style={{
                  fontFamily: CHART_FONT,
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: AC.ink,
                  letterSpacing: -0.1,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: "70%",
                }}
                title={r.label}
              >
                {r.label}
              </div>
              <div
                style={{
                  fontFamily: CHART_FONT,
                  fontSize: 12,
                  fontWeight: 700,
                  color: AC.ink2,
                  display: "inline-flex",
                  alignItems: "baseline",
                  gap: 6,
                }}
              >
                {r.sub && (
                  <span style={{ color: AC.mute, fontWeight: 500, fontSize: 11 }}>
                    {r.sub}
                  </span>
                )}
                {fmt(r.value)}
              </div>
            </div>
            <div
              style={{
                height: 8,
                background: AC.bg,
                borderRadius: 99,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${Math.max(2, pct)}%`,
                  height: "100%",
                  background: color,
                  borderRadius: 99,
                  transition: "width .25s ease",
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── DonutChart — categorical breakdown ─────────────────────────────────

export function DonutChart({
  rows,
  size = 180,
  thickness = 22,
  centerLabel,
  centerSub,
}: {
  rows: { label: string; value: number; color?: string }[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerSub?: string;
}) {
  const total = rows.reduce((s, r) => s + r.value, 0);
  if (total === 0) {
    return <ChartEmpty height={size + 40} />;
  }
  const r = (size - thickness) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const C = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div
      style={{
        display: "flex",
        gap: 18,
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={AC.bg}
            strokeWidth={thickness}
          />
          {rows.map((row, i) => {
            const pct = row.value / total;
            const dash = pct * C;
            const gap = C - dash;
            const offset = -acc;
            acc += dash;
            const color = row.color || CHART_PALETTE[i % CHART_PALETTE.length];
            return (
              <circle
                key={i}
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke={color}
                strokeWidth={thickness}
                strokeDasharray={`${dash} ${gap}`}
                strokeDashoffset={offset}
                transform={`rotate(-90 ${cx} ${cy})`}
                strokeLinecap="butt"
              />
            );
          })}
        </svg>
        {(centerLabel || centerSub) && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none",
            }}
          >
            {centerLabel && (
              <div
                style={{
                  fontFamily: CHART_FONT,
                  fontSize: 22,
                  fontWeight: 700,
                  color: AC.ink,
                  letterSpacing: -0.5,
                  lineHeight: 1,
                }}
              >
                {centerLabel}
              </div>
            )}
            {centerSub && (
              <div
                style={{
                  fontFamily: CHART_FONT,
                  fontSize: 10.5,
                  color: AC.mute,
                  fontWeight: 600,
                  letterSpacing: 0.3,
                  textTransform: "uppercase",
                  marginTop: 4,
                }}
              >
                {centerSub}
              </div>
            )}
          </div>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 0 }}>
        {rows.map((row, i) => {
          const pct = total > 0 ? (row.value / total) * 100 : 0;
          const color = row.color || CHART_PALETTE[i % CHART_PALETTE.length];
          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontFamily: CHART_FONT,
                fontSize: 12,
              }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 3,
                  background: color,
                  flexShrink: 0,
                }}
              />
              <span style={{ color: AC.ink, fontWeight: 600, flex: 1 }}>
                {row.label}
              </span>
              <span style={{ color: AC.ink2, fontWeight: 700 }}>{row.value}</span>
              <span
                style={{
                  color: AC.mute,
                  fontWeight: 500,
                  width: 38,
                  textAlign: "right",
                }}
              >
                {pct.toFixed(0)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Empty state ────────────────────────────────────────────────────────

function ChartEmpty({ height }: { height: number }) {
  return (
    <div
      style={{
        height,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: CHART_FONT,
        fontSize: 12.5,
        color: AC.mute,
        background: AC.bg,
        borderRadius: 8,
      }}
    >
      No data in this period.
    </div>
  );
}
