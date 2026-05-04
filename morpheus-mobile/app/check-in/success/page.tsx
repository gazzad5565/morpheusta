"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { MC } from "@/lib/tokens";
import { AppHeader, AppFooter, CustomerTile, PrimaryButton } from "@/components/Chrome";
import { Glyph, type GlyphName } from "@/components/Glyph";

export default function SuccessPageWrapper() {
  return (
    <Suspense fallback={null}>
      <SuccessPage />
    </Suspense>
  );
}

function SuccessPage() {
  const router = useRouter();
  const params = useSearchParams();
  const locationReason = params.get("locationReason") || "Customer site closed";
  const locationNote = params.get("locationNote") || "";
  const lateReason = params.get("lateReason") || "Traffic";
  const lateNote = params.get("lateNote") || "";

  return (
    <div
      style={{
        background: MC.bg,
        minHeight: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
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
        <div
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
            <Glyph name="check" size={38} color="#fff" strokeWidth={2.5} />
          </div>
        </div>

        <div
          style={{
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
          style={{
            fontFamily: MC.font,
            fontSize: 14,
            color: MC.mute,
            marginTop: 6,
            textAlign: "center",
            maxWidth: 300,
          }}
        >
          Shift at GreenWave Innovations started at 2:13 PM. Your reasons were sent to your
          manager.
        </div>

        <div
          style={{
            width: "100%",
            background: MC.card,
            border: `1px solid ${MC.line}`,
            borderRadius: MC.radiusCard,
            padding: 14,
            marginTop: 22,
          }}
        >
          <SummaryRow
            iconTone={MC.dangerTint}
            iconColor={MC.danger}
            iconName="pin"
            title="Off-site check-in"
            value={locationReason}
            note={locationNote}
          />
          <div style={{ height: 1, background: MC.line, margin: "12px 0" }} />
          <SummaryRow
            iconTone={MC.warnTint}
            iconColor="#b27606"
            iconName="clock"
            title="Late by 6h 13m"
            value={lateReason}
            note={lateNote}
          />
        </div>

        <div
          style={{
            width: "100%",
            marginTop: 16,
            padding: 14,
            background: MC.card,
            border: `1px solid ${MC.line}`,
            borderRadius: MC.radiusCard,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <CustomerTile initials="N" color={MC.swatch.NG} size={40} />
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
              }}
            >
              NextGenTech
            </div>
          </div>
          <Glyph name="chev-r" size={18} color={MC.mute} />
        </div>
      </div>

      <div style={{ padding: "0 16px 18px" }}>
        <PrimaryButton onClick={() => router.push("/active")} icon="arrow-r">
          Start activities
        </PrimaryButton>
      </div>

      <AppFooter />
    </div>
  );
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
