"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MC } from "@/lib/tokens";
import { PrimaryButton } from "@/components/Chrome";
import { Glyph } from "@/components/Glyph";
import { signIn, signUp } from "@/lib/auth";

type Mode = "login" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    if (busy) return;
    setError(null);

    if (!email.trim() || !pwd.trim()) {
      setError("Email and password are both required.");
      return;
    }
    if (pwd.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setBusy(true);
    const result =
      mode === "login"
        ? await signIn(email.trim(), pwd)
        : await signUp(email.trim(), pwd);
    setBusy(false);

    if (!result.ok) {
      setError(result.error || "Something went wrong. Try again.");
      return;
    }

    // AuthGate also redirects on session change, but be explicit so we move
    // immediately rather than waiting for the listener.
    router.replace("/");
  };

  return (
    <div
      style={{
        width: "100%",
        minHeight: "100vh",
        background: "#fff",
        padding: "100px 24px 24px",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 42,
            height: 42,
            borderRadius: 12,
            background: MC.ink,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: 14,
              height: 14,
              borderRadius: 3,
              background: MC.brand,
              boxShadow: `0 0 0 2px ${MC.ink}, 0 0 0 3px ${MC.brand}`,
            }}
          />
        </div>
        <div>
          <div
            style={{
              fontFamily: MC.font,
              fontSize: 12,
              fontWeight: 600,
              color: MC.hint,
              letterSpacing: 1.5,
              textTransform: "uppercase",
            }}
          >
            Morpheus
          </div>
          <div
            style={{
              fontFamily: MC.fontDisplay,
              fontSize: 16,
              fontWeight: 700,
              color: MC.ink,
              letterSpacing: -0.2,
            }}
          >
            Time &amp; Attendance²
          </div>
        </div>
      </div>

      <div
        style={{
          fontFamily: MC.fontDisplay,
          fontSize: 34,
          fontWeight: 700,
          color: MC.ink,
          letterSpacing: -0.8,
          lineHeight: 1.05,
          marginTop: 40,
        }}
      >
        {mode === "login" ? "Welcome back." : "Get started."}
      </div>
      <div
        style={{
          fontFamily: MC.font,
          fontSize: 14,
          color: MC.mute,
          marginTop: 6,
        }}
      >
        {mode === "login"
          ? "Log in with your merchandiser credentials to start your shift."
          : "Create an account to start using Morpheus on this device."}
      </div>

      <div style={{ marginTop: 28 }}>
        <LightField label="Email" value={email} onChange={setEmail} type="email" autoFocus />
        <div style={{ height: 16 }} />
        <LightField label="Password" value={pwd} onChange={setPwd} pwd />
      </div>

      {error && (
        <div
          style={{
            marginTop: 14,
            padding: "10px 12px",
            background: MC.dangerTint,
            color: "#9c1a3c",
            borderRadius: 10,
            fontFamily: MC.font,
            fontSize: 13,
            fontWeight: 500,
            display: "flex",
            gap: 8,
            alignItems: "flex-start",
          }}
        >
          <Glyph name="warn" size={14} color="#9c1a3c" />
          <span>{error}</span>
        </div>
      )}

      <div style={{ height: 24 }} />
      <PrimaryButton onClick={onSubmit} icon="arrow-r" disabled={busy}>
        {busy
          ? mode === "login"
            ? "Logging in…"
            : "Creating account…"
          : mode === "login"
          ? "Log in"
          : "Create account"}
      </PrimaryButton>

      <div
        style={{
          marginTop: 18,
          textAlign: "center",
          fontFamily: MC.font,
          fontSize: 13,
          color: MC.mute,
        }}
      >
        {mode === "login" ? (
          <>
            New to Morpheus?{" "}
            <button
              type="button"
              onClick={() => {
                setMode("signup");
                setError(null);
              }}
              style={{
                background: "transparent",
                border: "none",
                color: MC.brandDeep,
                fontFamily: MC.font,
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                padding: 0,
              }}
            >
              Create an account
            </button>
          </>
        ) : (
          <>
            Have an account?{" "}
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setError(null);
              }}
              style={{
                background: "transparent",
                border: "none",
                color: MC.brandDeep,
                fontFamily: MC.font,
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                padding: 0,
              }}
            >
              Log in
            </button>
          </>
        )}
      </div>

      <div style={{ flex: 1 }} />
      <div
        style={{
          fontFamily: MC.font,
          fontSize: 11,
          color: MC.hint,
          textAlign: "center",
          letterSpacing: 0.4,
        }}
      >
        v5.12.0 · build 2026.04.23
      </div>
    </div>
  );
}

function LightField({
  label,
  value,
  onChange,
  pwd,
  type,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  pwd?: boolean;
  type?: string;
  autoFocus?: boolean;
}) {
  return (
    <div>
      <div
        style={{
          fontFamily: MC.font,
          fontSize: 11,
          fontWeight: 600,
          color: MC.hint,
          letterSpacing: 0.6,
          textTransform: "uppercase",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        style={{
          height: 48,
          borderRadius: 12,
          background: "#FBFBFC",
          border: `1px solid ${MC.line}`,
          display: "flex",
          alignItems: "center",
          padding: "0 14px",
        }}
      >
        <input
          value={value}
          type={pwd ? "password" : type || "text"}
          autoComplete={pwd ? "current-password" : type === "email" ? "email" : "off"}
          autoFocus={autoFocus}
          onChange={(e) => onChange(e.target.value)}
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            color: MC.ink,
            fontFamily: MC.font,
            fontSize: 15,
          }}
        />
      </div>
    </div>
  );
}
