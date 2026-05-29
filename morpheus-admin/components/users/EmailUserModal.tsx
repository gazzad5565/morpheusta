"use client";

/**
 * EmailUserModal — small portal-based dialog for the "Email this user"
 * action that lives on both /settings/managers/[id]/edit and on
 * /reps/[id]. Both surfaces open the same modal; both call the same
 * /api/users/[id]/send-credentials route under the hood.
 *
 * Two actions:
 *   - "Send invite link" (regenerate=false) — keeps the user's current
 *     password (if any), emails a Supabase-generated recovery link.
 *     Default / first button because it's non-destructive.
 *   - "Regenerate password and email" (regenerate=true) — generates a
 *     fresh password server-side, updates the user's auth row, emails
 *     the new password. Marked as the destructive-ish action because
 *     it invalidates the user's prior password.
 *
 * Reads `lastSentAt` from the parent so it can show "Last sent: 3m ago"
 * — the parent re-fetches the profile after a successful send and
 * passes the fresh timestamp back in.
 *
 * UI shape: backdrop + centred card, Escape and backdrop click both
 * close, body scroll locked while open. createPortal so the modal
 * escapes any stacking context the calling page sets up.
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Btn } from "@/components/ui/Btn";
import { AGlyph } from "@/components/ui/AGlyph";
import { AC } from "@/lib/tokens";
import { formatRelative } from "@/lib/format";
import {
  sendCredentials,
  type SendCredentialsResponse,
} from "@/lib/users-admin";

export interface EmailUserModalProps {
  userId: string;
  userName: string;
  userEmail: string;
  /** ISO timestamp of the last successful send, or null/undefined. */
  lastSentAt: string | null | undefined;
  onClose: () => void;
  /** Called on every successful send so the parent can refetch the
   *  profile row and update lastSentAt (or just bump it locally). */
  onSent?: () => void;
}

export function EmailUserModal({
  userId,
  userName,
  userEmail,
  lastSentAt,
  onClose,
  onSent,
}: EmailUserModalProps) {
  const [busy, setBusy] = useState<"invite" | "regenerate" | null>(null);
  const [result, setResult] = useState<SendCredentialsResponse | null>(null);
  const [mounted, setMounted] = useState(false);

  // createPortal needs document on the client only; defer until mount
  // so SSR / static-prerender don't try to read `document`.
  useEffect(() => {
    setMounted(true);
  }, []);

  // Escape closes; body scroll lock while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [busy, onClose]);

  const handleSend = async (regenerate: boolean) => {
    if (busy) return;
    setBusy(regenerate ? "regenerate" : "invite");
    setResult(null);
    const r = await sendCredentials(userId, regenerate);
    setBusy(null);
    setResult(r);
    if (r.ok) onSent?.();
  };

  if (!mounted) return null;

  // TODO(review #3): migrate to the shared <Modal> primitive. Kept
  // bespoke for now — it uses createPortal + a close-while-busy guard
  // + aria-labelledby, which the shared Modal would need extra props
  // to cover. Not worth destabilising the credential-email flow now.
  return createPortal(
    <div
      // Backdrop — click outside closes the modal (unless mid-request).
      onClick={() => !busy && onClose()}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.55)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        // Card — click inside should NOT close.
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="email-user-modal-title"
        style={{
          background: "#fff",
          borderRadius: 14,
          width: "100%",
          maxWidth: 460,
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow:
            "0 18px 48px rgba(15, 23, 42, 0.25), 0 0 0 1px rgba(15, 23, 42, 0.06)",
          padding: 24,
        }}
      >
        {/* ─── Header ───────────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: AC.brandSoft,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <AGlyph name="mail" size={18} color={AC.brandDeep} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              id="email-user-modal-title"
              style={{
                fontFamily: AC.font,
                fontSize: 16,
                fontWeight: 700,
                color: AC.ink,
                letterSpacing: -0.2,
              }}
            >
              Email {userName}
            </div>
            <div
              style={{
                fontFamily: AC.font,
                fontSize: 12,
                color: AC.mute,
                marginTop: 3,
                wordBreak: "break-all",
              }}
            >
              {userEmail}
            </div>
            {lastSentAt && (
              <div
                style={{
                  fontFamily: AC.font,
                  fontSize: 11,
                  color: AC.mute,
                  marginTop: 6,
                  fontStyle: "italic",
                }}
              >
                Last sent: {formatRelative(lastSentAt, " ago")}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => !busy && onClose()}
            disabled={!!busy}
            aria-label="Close"
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              border: "none",
              background: "transparent",
              cursor: busy ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <AGlyph name="x" size={14} color={AC.mute} />
          </button>
        </div>

        {/* ─── Body / actions ───────────────────────────────────── */}
        <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 10 }}>
          <ActionRow
            title="Send invite link"
            subtitle="Keeps the current password. Emails a one-time sign-in link they can use to land in the app and pick a permanent password."
            primary
            busy={busy === "invite"}
            disabled={!!busy}
            onClick={() => handleSend(false)}
          />
          <ActionRow
            title="Regenerate password and email"
            subtitle="Generates a fresh temporary password, replaces the user's current password, and emails the new credentials. Their old password stops working immediately."
            destructive
            busy={busy === "regenerate"}
            disabled={!!busy}
            onClick={() => handleSend(true)}
          />
        </div>

        {/* ─── Result ───────────────────────────────────────────── */}
        {result && <ResultPanel result={result} />}

        {/* ─── Footer ───────────────────────────────────────────── */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
          <Btn onClick={onClose} disabled={!!busy}>
            {result?.ok ? "Done" : "Close"}
          </Btn>
        </div>
      </div>
    </div>,
    document.body
  );
}

function ActionRow({
  title,
  subtitle,
  primary,
  destructive,
  busy,
  disabled,
  onClick,
}: {
  title: string;
  subtitle: string;
  primary?: boolean;
  destructive?: boolean;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const accent = destructive
    ? AC.warn
    : primary
    ? AC.brand
    : AC.line;
  const bg = busy
    ? AC.bg
    : destructive
    ? "#FFF8EE"
    : primary
    ? AC.brandSoft
    : "#fff";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "flex",
        gap: 12,
        padding: "12px 14px",
        borderRadius: 10,
        background: bg,
        border: `1px solid ${accent}`,
        cursor: disabled ? "not-allowed" : "pointer",
        textAlign: "left",
        opacity: disabled && !busy ? 0.5 : 1,
        alignItems: "flex-start",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: AC.font,
            fontSize: 13.5,
            fontWeight: 700,
            color: destructive ? "#8E5A0E" : primary ? AC.brandInk : AC.ink,
            letterSpacing: -0.1,
          }}
        >
          {busy ? "Sending…" : title}
        </div>
        <div
          style={{
            fontFamily: AC.font,
            fontSize: 11.5,
            color: AC.mute,
            marginTop: 4,
            lineHeight: 1.45,
          }}
        >
          {subtitle}
        </div>
      </div>
    </button>
  );
}

function ResultPanel({ result }: { result: SendCredentialsResponse }) {
  // Three states: full success, partial (password reset but email failed),
  // hard failure. Each gets a tone + message + optional password-copy block.
  if (result.ok) {
    return (
      <div
        style={{
          marginTop: 14,
          padding: "12px 14px",
          background: AC.okTint,
          color: "#0F5A38",
          borderRadius: 10,
          fontFamily: AC.font,
          fontSize: 12.5,
          fontWeight: 500,
          lineHeight: 1.5,
        }}
      >
        ✓ {result.message || `Email sent to ${result.sentTo}.`}
        {result.regenerated && result.newPassword && (
          <PasswordCopy password={result.newPassword} />
        )}
      </div>
    );
  }
  if (result.passwordReset && result.newPassword) {
    // Partial success — password did change, email failed.
    return (
      <div
        style={{
          marginTop: 14,
          padding: "12px 14px",
          background: "#FFF8EE",
          color: "#8E5A0E",
          borderRadius: 10,
          fontFamily: AC.font,
          fontSize: 12.5,
          fontWeight: 500,
          lineHeight: 1.5,
        }}
      >
        ⚠ Password was reset, but the email failed: {result.error}. Share
        this password manually so the user can sign in:
        <PasswordCopy password={result.newPassword} />
      </div>
    );
  }
  return (
    <div
      style={{
        marginTop: 14,
        padding: "12px 14px",
        background: AC.dangerTint,
        color: "#9c1a3c",
        borderRadius: 10,
        fontFamily: AC.font,
        fontSize: 12.5,
        fontWeight: 500,
        lineHeight: 1.5,
      }}
    >
      ✕ {result.error || "Send failed."}
      {result.skipped && (
        <div style={{ marginTop: 6, fontSize: 11.5, fontWeight: 400 }}>
          Add <code>RESEND_API_KEY</code> to the morpheus-admin Vercel
          project and redeploy to enable email.
        </div>
      )}
    </div>
  );
}

function PasswordCopy({ password }: { password: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — user can still select/copy manually */
    }
  };
  return (
    <div
      style={{
        marginTop: 8,
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 10px",
        background: "#fff",
        border: `1px solid ${AC.line}`,
        borderRadius: 8,
      }}
    >
      <code
        style={{
          flex: 1,
          fontFamily: AC.fontMono,
          fontSize: 13,
          fontWeight: 600,
          color: AC.ink,
          wordBreak: "break-all",
        }}
      >
        {password}
      </code>
      <button
        type="button"
        onClick={copy}
        style={{
          padding: "4px 10px",
          borderRadius: 6,
          border: `1px solid ${AC.line}`,
          background: copied ? AC.okTint : "#fff",
          color: copied ? "#0F5A38" : AC.ink,
          fontFamily: AC.font,
          fontSize: 11,
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        {copied ? "Copied ✓" : "Copy"}
      </button>
    </div>
  );
}
