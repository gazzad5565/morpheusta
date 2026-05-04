import { AC } from "@/lib/tokens";
import { Card } from "@/components/ui/Card";
import { AGlyph } from "@/components/ui/AGlyph";
import { RepAvatar } from "@/components/ui/Avatars";
import { Btn } from "@/components/ui/Btn";
import { EXCEPTIONS, FEED, getRep } from "@/lib/mock-data";

const KIND_LABEL: Record<string, string> = {
  late: "Late",
  offsite: "Off-site",
  checkin: "Check-in",
  travel: "Travelling",
  missed: "Missed",
};

export function LiveFeedPanel() {
  return (
    <Card padding={0}>
      <div style={{ padding: "12px 14px 0", borderBottom: `1px solid ${AC.line}` }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 10,
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
            Live feed
          </div>
          <button
            type="button"
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontFamily: AC.font,
              fontSize: 11.5,
              color: AC.mute,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            Today <AGlyph name="chev-d" size={11} color={AC.mute} />
          </button>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {[
            { label: "Needs action", count: EXCEPTIONS.length, active: true, tone: AC.danger },
            { label: "All activity", count: FEED.length, active: false },
            { label: "On break", count: 2, active: false },
          ].map((t) => (
            <button
              key={t.label}
              type="button"
              style={{
                padding: "6px 10px",
                borderRadius: "6px 6px 0 0",
                background: "transparent",
                border: "none",
                borderBottom: t.active
                  ? `2px solid ${AC.ink}`
                  : `2px solid transparent`,
                fontFamily: AC.font,
                fontSize: 11.5,
                fontWeight: 700,
                color: t.active ? AC.ink : AC.mute,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 5,
                marginBottom: -1,
              }}
            >
              {t.label}
              <span
                style={{
                  padding: "1px 6px",
                  borderRadius: 99,
                  fontSize: 10,
                  fontWeight: 700,
                  background: t.tone ? AC.dangerTint : AC.bg,
                  color: t.tone || AC.mute,
                }}
              >
                {t.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: "8px 10px 6px", background: "#FFF8F6" }}>
        {EXCEPTIONS.map((e, i) => {
          const rep = getRep(e.repId);
          if (!rep) return null;
          return (
            <div
              key={e.id}
              style={{
                padding: 10,
                marginBottom: i === EXCEPTIONS.length - 1 ? 0 : 6,
                background: "#fff",
                border: `1px solid ${AC.line}`,
                borderLeft: `3px solid ${AC.danger}`,
                borderRadius: 8,
                display: "flex",
                gap: 10,
                alignItems: "flex-start",
              }}
            >
              <RepAvatar rep={rep} size={28} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    marginBottom: 3,
                    flexWrap: "wrap",
                    lineHeight: 1.15,
                  }}
                >
                  <span
                    style={{
                      fontFamily: AC.font,
                      fontSize: 12.5,
                      fontWeight: 700,
                      color: AC.ink,
                      letterSpacing: -0.1,
                    }}
                  >
                    {rep.name}
                  </span>
                  <span
                    style={{
                      padding: "2px 6px",
                      borderRadius: 99,
                      background: AC.dangerTint,
                      color: AC.danger,
                      fontFamily: AC.font,
                      fontSize: 9.5,
                      fontWeight: 700,
                      letterSpacing: 0.4,
                      textTransform: "uppercase",
                      lineHeight: 1.2,
                    }}
                  >
                    {KIND_LABEL[e.kind]}
                  </span>
                  <div style={{ flex: 1 }} />
                  <span
                    style={{
                      fontFamily: AC.fontMono,
                      fontSize: 10.5,
                      color: AC.hint,
                      fontWeight: 600,
                    }}
                  >
                    {e.ts}
                  </span>
                </div>
                <div
                  style={{
                    fontFamily: AC.font,
                    fontSize: 11.5,
                    color: AC.ink2,
                    lineHeight: 1.45,
                    fontWeight: 500,
                  }}
                >
                  {e.text}
                </div>
                <div style={{ fontFamily: AC.font, fontSize: 10.5, color: AC.mute, marginTop: 2 }}>
                  {e.meta}
                </div>
                <div style={{ display: "flex", gap: 5, marginTop: 7 }}>
                  <Btn size="sm" kind="primary">Resolve</Btn>
                  <Btn size="sm">Message</Btn>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
