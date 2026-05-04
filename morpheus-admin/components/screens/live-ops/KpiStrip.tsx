import { AC } from "@/lib/tokens";
import { KPIS } from "@/lib/mock-data";

type Tone = "ok" | "warn" | "danger" | "info";

interface KpiItem {
  label: string;
  value: string;
  sub: string;
  tone: Tone;
  spark: number[];
}

export function KpiStrip() {
  const k = KPIS;
  const items: KpiItem[] = [
    { label: "Reps active now", value: `${k.repsActive}`, sub: `of ${k.repsTotal} on shift`, tone: "ok", spark: [3, 5, 4, 6, 7, 8, 8, 8] },
    { label: "Shifts today", value: `${k.shiftsToday}`, sub: `${k.shiftsCompleted} completed`, tone: "info", spark: [6, 8, 10, 11, 12, 12, 12, 12] },
    { label: "On-time check-ins", value: `${k.onTimePct}%`, sub: "↑ 4 pts vs last Mon", tone: "ok", spark: [70, 72, 68, 75, 80, 79, 82, 83] },
    { label: "Open exceptions", value: `${k.exceptionsOpen}`, sub: "2 late · 1 off-site", tone: "warn", spark: [1, 2, 2, 3, 3, 3, 3, 3] },
    { label: "Avg shift completion", value: `${k.avgCompletion}%`, sub: "rolling 7-day", tone: "ok", spark: [88, 89, 91, 90, 92, 91, 92, 92] },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
      {items.map((it, i) => (
        <KpiCard key={i} {...it} />
      ))}
    </div>
  );
}

function KpiCard({ label, value, sub, tone, spark }: KpiItem) {
  const toneColor: Record<Tone, string> = {
    ok: AC.ok,
    warn: AC.warn,
    danger: AC.danger,
    info: AC.brand,
  };
  const c = toneColor[tone];
  const max = Math.max(...spark);

  return (
    <div
      style={{
        background: AC.card,
        border: `1px solid ${AC.line}`,
        borderRadius: AC.radiusCard,
        padding: 14,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        minHeight: 102,
      }}
    >
      <div
        style={{
          fontFamily: AC.font,
          fontSize: 11.5,
          color: AC.mute,
          fontWeight: 600,
          letterSpacing: 0.1,
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <div
          style={{
            fontFamily: AC.font,
            fontSize: 28,
            fontWeight: 700,
            color: AC.ink,
            letterSpacing: -0.8,
            lineHeight: 1,
          }}
        >
          {value}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <div
          style={{
            fontFamily: AC.font,
            fontSize: 11,
            color: AC.mute,
            fontWeight: 500,
            letterSpacing: -0.1,
          }}
        >
          {sub}
        </div>
        <svg width="60" height="22" viewBox="0 0 60 22">
          {spark.map((v, i) => {
            const x = i * (60 / (spark.length - 1));
            const y = 22 - (v / max) * 18 - 2;
            const next = spark[i + 1];
            if (next === undefined) return null;
            const x2 = (i + 1) * (60 / (spark.length - 1));
            const y2 = 22 - (next / max) * 18 - 2;
            return (
              <line key={i} x1={x} y1={y} x2={x2} y2={y2} stroke={c} strokeWidth="1.5" strokeLinecap="round" />
            );
          })}
          <circle cx={60} cy={22 - (spark[spark.length - 1] / max) * 18 - 2} r="2.2" fill={c} />
        </svg>
      </div>
    </div>
  );
}
