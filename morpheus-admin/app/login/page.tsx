"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AGlyph } from "@/components/ui/AGlyph";
import { CB, inputStyle } from "@/components/ui/Filters";
import { AC } from "@/lib/tokens";
import { signIn, signUp } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (busy) return;
    setError(null);
    if (!email.trim() || !password.trim()) {
      setError("Email and password are required.");
      return;
    }
    if (mode === "signup" && !name.trim()) {
      setError("Tell us your name so reps see who scheduled them.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setBusy(true);
    const result =
      mode === "login"
        ? await signIn(email.trim(), password)
        : await signUp(email.trim(), password, name.trim());
    setBusy(false);
    if (!result.ok) {
      setError(result.error || "Something went wrong.");
      return;
    }
    router.replace("/");
  };

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        display: "grid",
        gridTemplateColumns: "1.1fr 1fr",
        background: "#fff",
        overflow: "hidden",
        fontFamily: AC.font,
      }}
    >
      <div
        style={{
          background: `linear-gradient(160deg, ${AC.brandInk} 0%, #052B33 60%, #03171C 100%)`,
          position: "relative",
          overflow: "hidden",
          padding: 56,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        <svg
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.16 }}
          viewBox="0 0 400 400"
          preserveAspectRatio="none"
        >
          <defs>
            <pattern id="g" width="32" height="32" patternUnits="userSpaceOnUse">
              <path d="M32 0H0V32" fill="none" stroke="#15B4D6" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="400" height="400" fill="url(#g)" />
        </svg>
        <div
          style={{
            position: "absolute",
            top: 80,
            right: 60,
            width: 110,
            height: 110,
            borderRadius: 99,
            border: `2px dashed ${AC.brand}`,
            opacity: 0.5,
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: 100,
            left: 60,
            width: 60,
            height: 60,
            borderRadius: 99,
            background: `${AC.brand}30`,
            border: `1px solid ${AC.brand}`,
          }}
        />

        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: AC.brand,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{ width: 18, height: 18, background: "#03171C", borderRadius: 4 }}
            />
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#fff", letterSpacing: 0.6 }}>
              MORPHEUS OPS
            </div>
            <div
              style={{ fontSize: 10.5, color: "#7FB6C5", letterSpacing: 0.4, marginTop: 1 }}
            >
              Workforce Operations. In real time.
            </div>
          </div>
        </div>

        <div style={{ position: "relative", maxWidth: 420 }}>
          <div
            style={{
              fontSize: 11,
              color: AC.brand,
              fontWeight: 700,
              letterSpacing: 1.5,
              textTransform: "uppercase",
              marginBottom: 12,
            }}
          >
            Field Operations Platform
          </div>
          <div
            style={{
              fontSize: 36,
              fontWeight: 700,
              color: "#fff",
              letterSpacing: -1,
              lineHeight: 1.1,
            }}
          >
            Know who&apos;s where — every shift, every site.
          </div>
          <div style={{ fontSize: 14, color: "#9FBFCB", marginTop: 16, lineHeight: 1.55 }}>
            Geofenced check-ins, route optimisation, tasks with photos and signatures, real-time
            messaging, and a clean audit trail — all in one workspace.
          </div>

          {/* Capability chips — replaces the legacy three-module
              switcher (Time & Attendance / Sales Orders / Auditing).
              Morpheus is one unified platform now; these chips just
              hint at the scope of what's inside. All "active" tone
              because none of them are gated. */}
          <div style={{ display: "flex", gap: 8, marginTop: 28, flexWrap: "wrap" }}>
            <ModulePill label="Live Ops" active />
            <ModulePill label="Workforce" active />
            <ModulePill label="Tasks" active />
            <ModulePill label="Schedule" active />
            <ModulePill label="Messaging" active />
            <ModulePill label="Reports" active />
          </div>
        </div>

        <div style={{ position: "relative", fontSize: 11, color: "#5C7E89", letterSpacing: 0.3 }}>
          © Morpheus Ops 2026
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 56 }}>
        <div style={{ width: "100%", maxWidth: 380 }}>
          <div style={{ fontSize: 26, fontWeight: 700, color: AC.ink, letterSpacing: -0.6 }}>
            Welcome back
          </div>
          <div style={{ fontSize: 13, color: AC.mute, marginTop: 6 }}>
            Sign in to the admin console.
          </div>

          <div style={{ marginTop: 28, display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <div
                style={{
                  fontSize: 11,
                  color: AC.mute,
                  fontWeight: 700,
                  letterSpacing: 0.3,
                  textTransform: "uppercase",
                  marginBottom: 6,
                }}
              >
                Workspace
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 12px",
                  border: `1px solid ${AC.line}`,
                  borderRadius: 9,
                }}
              >
                <div
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 6,
                    background: "#2E4FB8",
                    color: "#fff",
                    fontSize: 10,
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  AF
                </div>
                <div style={{ flex: 1, fontSize: 13, color: AC.ink, fontWeight: 600 }}>
                  atlasfield.morpheus.app
                </div>
                <AGlyph name="check" size={14} color={AC.ok} />
              </div>
            </div>
            {mode === "signup" && (
              <div>
                <div
                  style={{
                    fontSize: 11,
                    color: AC.mute,
                    fontWeight: 700,
                    letterSpacing: 0.3,
                    textTransform: "uppercase",
                    marginBottom: 6,
                  }}
                >
                  Your name
                </div>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Gary Durbach"
                  style={inputStyle}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onSubmit();
                  }}
                />
              </div>
            )}
            <div>
              <div
                style={{
                  fontSize: 11,
                  color: AC.mute,
                  fontWeight: 700,
                  letterSpacing: 0.3,
                  textTransform: "uppercase",
                  marginBottom: 6,
                }}
              >
                Email
              </div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                style={inputStyle}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onSubmit();
                }}
              />
            </div>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <div
                  style={{
                    fontSize: 11,
                    color: AC.mute,
                    fontWeight: 700,
                    letterSpacing: 0.3,
                    textTransform: "uppercase",
                  }}
                >
                  Password
                </div>
                <a
                  href="#"
                  style={{
                    fontSize: 11,
                    color: AC.brandDeep,
                    fontWeight: 600,
                    textDecoration: "none",
                  }}
                >
                  Forgot?
                </a>
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                style={inputStyle}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onSubmit();
                }}
              />
            </div>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 12.5,
                color: AC.ink2,
                fontWeight: 500,
              }}
            >
              <input type="checkbox" defaultChecked style={CB} /> Keep me signed in on this
              device
            </label>
            {error && (
              <div
                style={{
                  padding: "10px 12px",
                  background: AC.dangerTint,
                  color: "#9c1a3c",
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 500,
                  display: "flex",
                  gap: 8,
                  alignItems: "flex-start",
                }}
              >
                <AGlyph name="warn" size={14} color="#9c1a3c" />
                <span>{error}</span>
              </div>
            )}
            <button
              type="button"
              onClick={() => onSubmit()}
              disabled={busy}
              style={{
                padding: "12px 16px",
                borderRadius: 10,
                background: busy ? AC.faint : AC.brand,
                color: "#fff",
                border: "none",
                fontFamily: AC.font,
                fontSize: 14,
                fontWeight: 700,
                cursor: busy ? "not-allowed" : "pointer",
                letterSpacing: -0.1,
                marginTop: 6,
                textDecoration: "none",
                textAlign: "center",
              }}
            >
              {busy
                ? mode === "login"
                  ? "Signing in…"
                  : "Creating account…"
                : mode === "login"
                ? "Sign in →"
                : "Create account →"}
            </button>
            <div
              style={{
                marginTop: 4,
                textAlign: "center",
                fontSize: 12.5,
                color: AC.mute,
              }}
            >
              {mode === "login" ? (
                <>
                  No account?{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setMode("signup");
                      setError(null);
                    }}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: AC.brandDeep,
                      fontWeight: 700,
                      cursor: "pointer",
                      padding: 0,
                      fontSize: 12.5,
                      fontFamily: AC.font,
                    }}
                  >
                    Create one
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
                      color: AC.brandDeep,
                      fontWeight: 700,
                      cursor: "pointer",
                      padding: 0,
                      fontSize: 12.5,
                      fontFamily: AC.font,
                    }}
                  >
                    Sign in
                  </button>
                </>
              )}
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "6px 0",
              }}
            >
              <div style={{ flex: 1, height: 1, background: AC.line }} />
              <div
                style={{
                  fontSize: 10.5,
                  color: AC.faint,
                  fontWeight: 600,
                  letterSpacing: 0.3,
                  textTransform: "uppercase",
                }}
              >
                or
              </div>
              <div style={{ flex: 1, height: 1, background: AC.line }} />
            </div>
            <button
              type="button"
              style={{
                padding: "11px 16px",
                borderRadius: 10,
                background: "#fff",
                color: AC.ink2,
                border: `1px solid ${AC.line}`,
                fontFamily: AC.font,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 9,
              }}
            >
              <div
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 3,
                  background: "linear-gradient(135deg, #4285F4 0%, #34A853 100%)",
                }}
              />
              Continue with SSO
            </button>
          </div>

          <div
            style={{ marginTop: 32, fontSize: 11, color: AC.mute, lineHeight: 1.6 }}
          >
            By signing in you agree to the Morpheus{" "}
            <a href="#" style={{ color: AC.brandDeep, textDecoration: "none" }}>
              Terms
            </a>{" "}
            and{" "}
            <a href="#" style={{ color: AC.brandDeep, textDecoration: "none" }}>
              Data Processing Agreement
            </a>
            .
          </div>
        </div>
      </div>
    </div>
  );
}

function ModulePill({
  label,
  active,
  hint,
}: {
  label: string;
  active?: boolean;
  hint?: string;
}) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 11px",
        borderRadius: 99,
        background: active ? AC.brand : "rgba(255,255,255,0.06)",
        border: active ? "1px solid transparent" : "1px solid rgba(255,255,255,0.15)",
        color: active ? "#03171C" : "#9FBFCB",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: -0.1,
      }}
    >
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: 99,
          background: active ? "#03171C" : "#5C7E89",
        }}
      />
      {label}
      {hint && (
        <span
          style={{
            padding: "0 5px",
            borderRadius: 4,
            background: "rgba(255,255,255,0.08)",
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: 0.3,
          }}
        >
          {hint}
        </span>
      )}
    </div>
  );
}
