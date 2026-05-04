import { notFound } from "next/navigation";
import { AdminShell } from "@/components/shell/AdminShell";
import { Btn } from "@/components/ui/Btn";
import { Card, SectionTitle } from "@/components/ui/Card";
import { AGlyph, type GlyphName } from "@/components/ui/AGlyph";
import { CustomerSwatch } from "@/components/ui/Avatars";
import { StatusPill } from "@/components/ui/StatusPill";
import { AC } from "@/lib/tokens";
import { REPS, CUSTOMERS } from "@/lib/mock-data";

export default async function RepDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const rep = REPS.find((r) => r.id === id);
  if (!rep) notFound();

  return (
    <AdminShell
      breadcrumbs={["Home", "Reps", rep.name]}
      actions={
        <div style={{ display: "flex", gap: 8 }}>
          <Btn icon="mail" size="sm">Message</Btn>
          <Btn icon="edit" kind="primary" size="sm">Edit</Btn>
        </div>
      }
    >
      <div
        style={{
          padding: 20,
          display: "grid",
          gridTemplateColumns: "320px 1fr",
          gap: 16,
          alignItems: "start",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Card padding={20}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 99,
                  background: AC.brand,
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: AC.font,
                  fontSize: 20,
                  fontWeight: 700,
                  letterSpacing: 0.5,
                }}
              >
                {rep.initials}
              </div>
              <div>
                <div
                  style={{
                    fontFamily: AC.font,
                    fontSize: 17,
                    fontWeight: 700,
                    color: AC.ink,
                    letterSpacing: -0.3,
                  }}
                >
                  {rep.name}
                </div>
                <div style={{ fontFamily: AC.font, fontSize: 12, color: AC.mute, marginTop: 2 }}>
                  {rep.role || "Field Rep"} · {rep.region}
                </div>
                <div style={{ marginTop: 6 }}>
                  <StatusPill status={rep.status} size="lg" />
                </div>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 10,
                paddingTop: 14,
                borderTop: `1px solid ${AC.line}`,
              }}
            >
              <DetailRow icon="mail" label="Email" value={rep.email} />
              <DetailRow icon="phone" label="Phone" value={rep.phone} />
              <DetailRow icon="building" label="Region" value={rep.region} />
              <DetailRow icon="cal" label="Joined" value={rep.joined} />
            </div>
          </Card>

          <Card padding={16}>
            <SectionTitle>Assigned customers</SectionTitle>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {CUSTOMERS.slice(0, 4).map((c) => (
                <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <CustomerSwatch customer={c} size={28} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontFamily: AC.font,
                        fontSize: 12.5,
                        color: AC.ink,
                        fontWeight: 600,
                        letterSpacing: -0.1,
                      }}
                    >
                      {c.name}
                    </div>
                    <div style={{ fontFamily: AC.font, fontSize: 11, color: AC.mute }}>
                      {c.code}
                    </div>
                  </div>
                  <div
                    style={{
                      fontFamily: AC.font,
                      fontSize: 11,
                      color: AC.mute,
                      fontWeight: 600,
                    }}
                  >
                    {c.sites} sites
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Card padding={0}>
            <div style={{ display: "flex", borderBottom: `1px solid ${AC.line}` }}>
              {["Overview", "Shift history", "Documents", "Time-off", "Activity log"].map(
                (t, i) => (
                  <button
                    key={t}
                    type="button"
                    style={{
                      padding: "12px 16px",
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      fontFamily: AC.font,
                      fontSize: 13,
                      fontWeight: 600,
                      color: i === 0 ? AC.ink : AC.mute,
                      borderBottom:
                        i === 0 ? `2px solid ${AC.brand}` : "2px solid transparent",
                      marginBottom: -1,
                      letterSpacing: -0.1,
                    }}
                  >
                    {t}
                  </button>
                )
              )}
            </div>

            <div style={{ padding: 16 }}>
              <SectionTitle>Performance · 90 days</SectionTitle>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  gap: 12,
                  marginBottom: 18,
                }}
              >
                <MiniStat label="Shifts" value={`${rep.shifts}`} delta="+12" tone="ok" />
                <MiniStat label="On-time" value={`${rep.completion}%`} delta="+3pt" tone="ok" />
                <MiniStat label="Late check-ins" value={`${rep.late}`} delta="-2" tone="ok" />
                <MiniStat label="Off-site flags" value={`${rep.offsite}`} delta="0" tone="neutral" />
              </div>

              <SectionTitle>Recent shifts</SectionTitle>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 0,
                  border: `1px solid ${AC.line}`,
                  borderRadius: 10,
                  overflow: "hidden",
                }}
              >
                {RECENT_SHIFTS.map((r, i) => (
                  <div
                    key={i}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "120px 1fr 140px 120px 90px 80px",
                      gap: 12,
                      alignItems: "center",
                      padding: "10px 14px",
                      borderBottom:
                        i < RECENT_SHIFTS.length - 1 ? `1px solid ${AC.lineDim}` : "none",
                      background: i === 0 ? AC.brandSoft : "#fff",
                    }}
                  >
                    <div
                      style={{
                        fontFamily: AC.font,
                        fontSize: 12.5,
                        color: AC.ink,
                        fontWeight: 600,
                      }}
                    >
                      {r.date}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 5,
                          background: r.color,
                          color: "#fff",
                          fontFamily: AC.font,
                          fontSize: 9,
                          fontWeight: 700,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {r.initials}
                      </div>
                      <div
                        style={{
                          fontFamily: AC.font,
                          fontSize: 12.5,
                          color: AC.ink2,
                          fontWeight: 500,
                        }}
                      >
                        {r.cust}
                      </div>
                    </div>
                    <div
                      style={{
                        fontFamily: AC.font,
                        fontSize: 12,
                        color: AC.ink2,
                        fontWeight: 600,
                      }}
                    >
                      {r.time}
                    </div>
                    <div
                      style={{
                        fontFamily: AC.font,
                        fontSize: 11,
                        fontWeight: 600,
                        color: r.state === "In progress" ? AC.brandDeep : AC.ok,
                      }}
                    >
                      {r.state}
                    </div>
                    <div
                      style={{
                        fontFamily: AC.fontMono,
                        fontSize: 11.5,
                        color: AC.ink2,
                        fontWeight: 600,
                      }}
                    >
                      {r.tasks}
                    </div>
                    <div
                      style={{
                        fontFamily: AC.fontMono,
                        fontSize: 11,
                        color: r.ot.startsWith("+")
                          ? AC.danger
                          : r.ot.startsWith("−")
                          ? AC.ok
                          : AC.mute,
                        fontWeight: 600,
                      }}
                    >
                      {r.ot}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </AdminShell>
  );
}

const RECENT_SHIFTS = [
  { date: "Today", cust: "GreenWave Innovations", initials: "GW", color: "#D9493D", time: "08:00–12:00", state: "In progress", tasks: "2/4", ot: "+0:00" },
  { date: "Mon 6 May", cust: "GreenWave Innovations", initials: "GW", color: "#D9493D", time: "08:00–12:00", state: "Completed", tasks: "4/4", ot: "+0:08" },
  { date: "Fri 3 May", cust: "NextGenTech", initials: "NG", color: "#E2A434", time: "13:00–17:30", state: "Completed", tasks: "5/5", ot: "−0:14" },
  { date: "Thu 2 May", cust: "OptimaSolutions", initials: "OS", color: "#2E9C82", time: "08:00–12:30", state: "Completed", tasks: "4/4", ot: "+0:00" },
  { date: "Wed 1 May", cust: "GreenWave Innovations", initials: "GW", color: "#D9493D", time: "08:00–12:00", state: "Completed", tasks: "3/4", ot: "+0:21" },
];

function DetailRow({ icon, label, value }: { icon: GlyphName; label: string; value: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div
        style={{
          width: 24,
          height: 24,
          borderRadius: 6,
          background: AC.bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <AGlyph name={icon} size={12} color={AC.mute} />
      </div>
      <div
        style={{
          fontFamily: AC.font,
          fontSize: 11,
          color: AC.mute,
          fontWeight: 600,
          width: 60,
        }}
      >
        {label}
      </div>
      <div style={{ fontFamily: AC.font, fontSize: 12.5, color: AC.ink, fontWeight: 500 }}>
        {value}
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  delta,
  tone,
}: {
  label: string;
  value: string;
  delta: string;
  tone: "ok" | "bad" | "neutral";
}) {
  const tc = { ok: AC.ok, bad: AC.danger, neutral: AC.mute }[tone];
  return (
    <div
      style={{
        padding: 12,
        borderRadius: 10,
        background: AC.bg,
        border: `1px solid ${AC.line}`,
      }}
    >
      <div
        style={{
          fontFamily: AC.font,
          fontSize: 11,
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
          fontSize: 22,
          fontWeight: 700,
          color: AC.ink,
          letterSpacing: -0.6,
          marginTop: 4,
        }}
      >
        {value}
      </div>
      <div
        style={{ fontFamily: AC.font, fontSize: 11, color: tc, fontWeight: 600, marginTop: 2 }}
      >
        {delta}
      </div>
    </div>
  );
}
