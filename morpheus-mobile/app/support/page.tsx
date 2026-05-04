"use client";

import { useRouter } from "next/navigation";
import { MC } from "@/lib/tokens";
import { AppHeader, AppFooter } from "@/components/Chrome";
import { Glyph } from "@/components/Glyph";

export default function SupportPage() {
  const router = useRouter();
  return (
    <div style={{ background: MC.bg, minHeight: "100%" }}>
      <AppHeader title="Support" onBack={() => router.push("/")} withMenu />
      <div style={{ padding: 40, textAlign: "center", color: MC.mute }}>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 16,
            background: MC.brandTint,
            margin: "0 auto 14px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Glyph name="mic" size={28} color={MC.brandDeep} />
        </div>
        <div
          style={{
            fontFamily: MC.fontDisplay,
            fontSize: 20,
            fontWeight: 700,
            color: MC.ink,
            letterSpacing: -0.4,
          }}
        >
          Support
        </div>
        <div style={{ fontFamily: MC.font, fontSize: 14, marginTop: 8, lineHeight: 1.5 }}>
          Contact your manager via Morpheus admin
          <br />
          or email <b style={{ color: MC.ink }}>support@morpheus.app</b>
        </div>
      </div>
      <AppFooter />
    </div>
  );
}
