import { AdminShell } from "@/components/shell/AdminShell";
import { Btn } from "@/components/ui/Btn";
import { Card, SectionTitle } from "@/components/ui/Card";
import { RepAvatar } from "@/components/ui/Avatars";
import { SegTabs } from "@/components/ui/SegTabs";
import { AC } from "@/lib/tokens";
import { REPS } from "@/lib/mock-data";

export default function ReportsPage() {
  return (
    <AdminShell
      breadcrumbs={["Home", "Reports"]}
      actions={
        <div style={{ display: "flex", gap: 8 }}>
          <Btn icon="cal" size="sm">May 2025</Btn>
          <Btn icon="download" kind="primary" size="sm">Export</Btn>
        </div>
      }
    >
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          <BigStat label="Hours logged · MTD" value="1,284h" sub="↑ 8.4% vs Apr" />
          <BigStat label="Shifts completed" value="312" sub="of 324 scheduled" />
          <BigStat label="On-time rate" value="91.2%" sub="↑ 2.1pt vs Apr" />
          <BigStat label="Off-site flags" value="9" sub="3 unresolved" tone="warn" />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 16 }}>
          <Card padding={16}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 12,
              }}
            >
              <div>
                <div
                  style={{
                    fontFamily: AC.font,
                    fontSize: 13,
                    fontWeight: 700,
                    color: AC.ink,
                    letterSpacing: -0.1,
                  }}
                >
                  Hours by customer
                </div>
                <div style={{ fontFamily: AC.font, fontSize: 11, color: AC.mute, marginTop: 2 }}>
                  Last 30 days · stacked
                </div>
              </div>
              <SegTabs tabs={["Hours", "Shifts", "Tasks"]} active="Hours" />
            </div>
            <BarChart />
          </Card>

          <Card padding={16}>
            <SectionTitle>On-time check-ins · 7 days</SectionTitle>
            <LineChart />
          </Card>
        </div>

        <Card padding={0}>
          <div
            style={{
              padding: "12px 16px",
              borderBottom: `1px solid ${AC.line}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div
              style={{
                fontFamily: AC.font,
                fontSize: 13,
                fontWeight: 700,
                color: AC.ink,
              }}
            >
              Top reps · last 30 days
            </div>
            <button
              type="button"
              style={{
                background: "transparent",
                border: "none",
                color: AC.brandDeep,
                fontFamily: AC.font,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Open report ›
            </button>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "40px 2fr 1fr 1fr 1fr 1fr 1.5fr",
              gap: 12,
              padding: "8px 16px",
              background: AC.bg,
              borderBottom: `1px solid ${AC.line}`,
              fontFamily: AC.font,
              fontSize: 11,
              color: AC.mute,
              fontWeight: 600,
              letterSpacing: 0.3,
              textTransform: "uppercase",
            }}
          >
            <div>#</div>
            <div>Rep</div>
            <div>Hours</div>
            <div>Shifts</div>
            <div>On-time</div>
            <div>Tasks</div>
            <div>Trend</div>
          </div>
          {REPS.slice(0, 6).map((r, i) => (
            <div
              key={r.id}
              style={{
                display: "grid",
                gridTemplateColumns: "40px 2fr 1fr 1fr 1fr 1fr 1.5fr",
                gap: 12,
                alignItems: "center",
                padding: "11px 16px",
                borderBottom: `1px solid ${AC.lineDim}`,
              }}
            >
              <div
                style={{
                  fontFamily: AC.fontMono,
                  fontSize: 12,
                  color: AC.mute,
                  fontWeight: 600,
                }}
              >
                0{i + 1}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <RepAvatar rep={r} size={26} />
                <div
                  style={{
                    fontFamily: AC.font,
                    fontSize: 12.5,
                    color: AC.ink,
                    fontWeight: 600,
                  }}
                >
                  {r.name}
                </div>
              </div>
              <div
                style={{ fontFamily: AC.font, fontSize: 13, color: AC.ink, fontWeight: 600 }}
              >
                {160 - i * 9}h
              </div>
              <div
                style={{
                  fontFamily: AC.font,
                  fontSize: 13,
                  color: AC.ink2,
                  fontWeight: 600,
                }}
              >
                {(r.shifts % 60) + 18}
              </div>
              <div style={{ fontFamily: AC.font, fontSize: 13, color: AC.ok, fontWeight: 700 }}>
                {99 - i}%
              </div>
              <div
                style={{
                  fontFamily: AC.font,
                  fontSize: 13,
                  color: AC.ink2,
                  fontWeight: 600,
                }}
              >
                {r.completion}%
              </div>
              <Spark values={[3, 4, 5, 4, 6, 7, 8, 7, 9, 8, 9, 10].map((v) => v + i)} />
            </div>
          ))}
        </Card>
      </div>
    </AdminShell>
  );
}

function BigStat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "warn";
}) {
  return (
    <div
      style={{
        background: "#fff",
        border: `1px solid ${AC.line}`,
        borderRadius: 14,
        padding: 16,
      }}
    >
      <div
        style={{
          fontFamily: AC.font,
          fontSize: 11.5,
          color: AC.mute,
          fontWeight: 600,
          letterSpacing: 0.2,
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: AC.font,
          fontSize: 30,
          fontWeight: 700,
          color: AC.ink,
          letterSpacing: -0.8,
          marginTop: 6,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontFamily: AC.font,
          fontSize: 12,
          color: tone === "warn" ? AC.warn : AC.mute,
          fontWeight: 500,
          marginTop: 2,
        }}
      >
        {sub}
      </div>
    </div>
  );
}

function BarChart() {
  const data = [
    { label: "GreenWave", vals: [42, 38, 45, 52], color: "#D9493D" },
    { label: "NextGen", vals: [28, 32, 30, 34], color: "#E2A434" },
    { label: "Optima", vals: [55, 60, 58, 62], color: "#2E9C82" },
    { label: "SiteB", vals: [18, 22, 20, 24], color: "#2E4FB8" },
    { label: "Protonix", vals: [35, 38, 42, 40], color: "#C55A2E" },
    { label: "Aria", vals: [48, 52, 50, 55], color: "#8E4ECC" },
    { label: "Highmark", vals: [62, 65, 68, 70], color: "#1FA971" },
  ];
  const max = 200;
  const w = 660;
  const h = 220;
  const pad = 30;
  const bw = ((w - pad * 2) / data.length) * 0.6;
  const gap = ((w - pad * 2) / data.length) * 0.4;
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h + 30}`}>
      {[0, 50, 100, 150, 200].map((g) => (
        <g key={g}>
          <line
            x1={pad}
            x2={w - 10}
            y1={h - (g / max) * h + 10}
            y2={h - (g / max) * h + 10}
            stroke={AC.lineDim}
            strokeWidth="1"
          />
          <text
            x={pad - 6}
            y={h - (g / max) * h + 14}
            textAnchor="end"
            fontFamily={AC.font}
            fontSize="9.5"
            fill={AC.hint}
          >
            {g}
          </text>
        </g>
      ))}
      {data.map((d, i) => {
        const x = pad + i * (bw + gap);
        const total = d.vals.reduce((a, b) => a + b, 0);
        let yCursor = h + 10;
        return (
          <g key={i}>
            {d.vals.map((v, vi) => {
              const bh = (v / max) * h;
              yCursor -= bh;
              const opacity = 0.4 + vi * 0.2;
              return (
                <rect
                  key={vi}
                  x={x}
                  y={yCursor}
                  width={bw}
                  height={bh}
                  fill={d.color}
                  opacity={opacity}
                />
              );
            })}
            <text
              x={x + bw / 2}
              y={h + 24}
              textAnchor="middle"
              fontFamily={AC.font}
              fontSize="10"
              fontWeight="600"
              fill={AC.ink2}
            >
              {d.label}
            </text>
            <text
              x={x + bw / 2}
              y={h - (total / max) * h + 6}
              textAnchor="middle"
              fontFamily={AC.font}
              fontSize="10"
              fontWeight="700"
              fill={AC.ink}
            >
              {total}h
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function LineChart() {
  const data = [78, 82, 85, 88, 84, 91, 91];
  const days = ["M", "T", "W", "T", "F", "S", "S"];
  const w = 320;
  const h = 200;
  const pad = 28;
  const max = 100;
  const min = 60;
  const x = (i: number) => pad + (i / (data.length - 1)) * (w - pad * 2);
  const y = (v: number) => pad + (1 - (v - min) / (max - min)) * (h - pad * 2);
  const path = data.map((v, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(v)}`).join(" ");
  const fill = `${path} L ${x(data.length - 1)} ${h - pad} L ${pad} ${h - pad} Z`;
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h + 20}`}>
      {[60, 70, 80, 90, 100].map((g) => (
        <g key={g}>
          <line
            x1={pad}
            x2={w - pad}
            y1={y(g)}
            y2={y(g)}
            stroke={AC.lineDim}
            strokeWidth="1"
          />
          <text
            x={pad - 6}
            y={y(g) + 3}
            textAnchor="end"
            fontFamily={AC.font}
            fontSize="9.5"
            fill={AC.hint}
          >
            {g}%
          </text>
        </g>
      ))}
      <path d={fill} fill={AC.brand} opacity="0.1" />
      <path d={path} fill="none" stroke={AC.brand} strokeWidth="2" />
      {data.map((v, i) => (
        <circle
          key={i}
          cx={x(i)}
          cy={y(v)}
          r="3"
          fill={AC.brand}
          stroke="#fff"
          strokeWidth="1.5"
        />
      ))}
      {days.map((d, i) => (
        <text
          key={i}
          x={x(i)}
          y={h + 6}
          textAnchor="middle"
          fontFamily={AC.font}
          fontSize="10"
          fontWeight="600"
          fill={AC.mute}
        >
          {d}
        </text>
      ))}
    </svg>
  );
}

function Spark({ values }: { values: number[] }) {
  const max = Math.max(...values);
  const w = 120;
  const h = 24;
  return (
    <svg width={w} height={h}>
      {values.map((v, i) => {
        if (i === values.length - 1) return null;
        const x1 = (i / (values.length - 1)) * w;
        const x2 = ((i + 1) / (values.length - 1)) * w;
        const y1 = h - (v / max) * (h - 4) - 2;
        const y2 = h - (values[i + 1] / max) * (h - 4) - 2;
        return (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={AC.brand}
            strokeWidth="1.5"
          />
        );
      })}
    </svg>
  );
}
