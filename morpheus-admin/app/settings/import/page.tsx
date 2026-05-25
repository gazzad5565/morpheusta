"use client";

/**
 * /settings/import — defaults for the bulk import hub.
 *
 * Two controls, both org-wide:
 *   1. Duplicate behaviour — Skip (don't touch an existing matching
 *      row) vs Update (overwrite with the imported fields). Pre-fills
 *      the Settings step on every upload, overridable per-upload from
 *      the hub itself.
 *   2. Send welcome email by default on user import — when on, rep /
 *      manager imports email each created user their credentials via
 *      Resend the moment the row is created. Manager can flip this
 *      off per-upload too.
 *
 * Lives at /settings/import (added to SETTINGS_SECTIONS in
 * SettingsShell). The hub at /import (Phase C) reads both via
 * getImportSettings() to pre-fill its own Settings step.
 */

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { SettingsShell } from "@/components/shell/SettingsShell";
import { AC } from "@/lib/tokens";
import {
  getImportSettings,
  setImportDefaultDuplicateMode,
  setImportSendWelcomeEmailDefault,
  type ImportDuplicateMode,
} from "@/lib/settings-store";

export default function ImportSettingsPage() {
  const [duplicateMode, setDuplicateMode] = useState<ImportDuplicateMode>("skip");
  const [sendWelcome, setSendWelcome] = useState<boolean>(true);
  const [loaded, setLoaded] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    getImportSettings().then((s) => {
      setDuplicateMode(s.duplicateMode);
      setSendWelcome(s.sendWelcomeEmail);
      setLoaded(true);
    });
  }, []);

  // Optimistic flip — segmented picker. Revert on failure so the
  // UI stays truthful about what's stored.
  const changeDuplicateMode = async (next: ImportDuplicateMode) => {
    const prev = duplicateMode;
    setDuplicateMode(next);
    setSavingKey("dup");
    const r = await setImportDefaultDuplicateMode(next);
    setSavingKey(null);
    if (!r.ok) {
      setDuplicateMode(prev);
      setMessage(r.error || "Couldn't save.");
      return;
    }
    setMessage(
      next === "skip"
        ? "Default set to Skip — existing rows that match the dedup key are left untouched on import."
        : "Default set to Update — existing rows that match the dedup key are overwritten with the imported fields."
    );
  };

  const toggleSendWelcome = async (next: boolean) => {
    setSendWelcome(next);
    setSavingKey("welcome");
    const r = await setImportSendWelcomeEmailDefault(next);
    setSavingKey(null);
    if (!r.ok) {
      setSendWelcome(!next);
      setMessage(r.error || "Couldn't save.");
      return;
    }
    setMessage(
      next
        ? "Welcome email will be sent by default when reps or managers are imported."
        : "Welcome email will be skipped by default — credentials still appear in the success CSV."
    );
  };

  return (
    <SettingsShell
      section="import"
      description="Defaults for the bulk import hub at /import. Both settings can be overridden per-upload on the import's Settings step."
    >
      {/* Duplicate behaviour picker. Segmented to mirror the photo-
          quality tier picker on /settings/check-in-rules so the two
          settings feel related. */}
      <Card padding={20} style={{ marginBottom: 14 }}>
        <SectionLabel>Default duplicate behaviour</SectionLabel>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {DUP_OPTIONS.map((opt) => {
            const active = duplicateMode === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => changeDuplicateMode(opt.id)}
                disabled={!loaded || savingKey === "dup"}
                style={{
                  flex: "1 1 0",
                  minWidth: 180,
                  padding: "12px 14px",
                  borderRadius: 10,
                  background: active ? AC.brand : "#fff",
                  color: active ? "#fff" : AC.ink,
                  border: `1px solid ${active ? AC.brand : AC.line}`,
                  fontFamily: AC.font,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  textAlign: "left",
                  opacity: !loaded ? 0.55 : 1,
                }}
              >
                <div>{opt.label}</div>
                <div
                  style={{
                    fontSize: 11.5,
                    fontWeight: 500,
                    opacity: 0.9,
                    marginTop: 3,
                    lineHeight: 1.4,
                  }}
                >
                  {opt.subtitle}
                </div>
              </button>
            );
          })}
        </div>
        <Hint>
          A row is treated as a duplicate when its dedup key matches an
          existing record — customer <b style={{ color: AC.ink2 }}>code</b>,
          site (<b style={{ color: AC.ink2 }}>customer_code + site_name</b>),
          user <b style={{ color: AC.ink2 }}>email</b>, or shift
          (<b style={{ color: AC.ink2 }}>customer_code + rep_email + date + start_time</b>).
        </Hint>
      </Card>

      {/* Welcome email toggle. Only governs rep / manager imports —
          the customer / site / shift adapters don't send mail. */}
      <Card padding={20}>
        <SectionLabel>Welcome email on user import</SectionLabel>
        <ToggleRow
          title="Send a welcome email by default"
          subtitle="When on, each rep or manager created via the import hub receives an email with their login + auto-generated password. Credentials still appear in the success CSV regardless."
          on={sendWelcome}
          saving={savingKey === "welcome"}
          disabled={!loaded}
          onChange={toggleSendWelcome}
        />
        <Hint>
          Resend's free tier delivers 100 emails / day. A bulk import of
          200 reps with this on will deliver across two days; the import
          itself completes immediately and the failed-delivery rows are
          surfaced on the run's result screen.
        </Hint>
      </Card>

      {message && (
        <div
          style={{
            marginTop: 14,
            padding: "8px 10px",
            background: AC.brandSoft,
            color: AC.brandInk,
            borderRadius: 8,
            fontFamily: AC.font,
            fontSize: 12,
            fontWeight: 500,
          }}
        >
          {message}
        </div>
      )}
    </SettingsShell>
  );
}

const DUP_OPTIONS: ReadonlyArray<{
  id: ImportDuplicateMode;
  label: string;
  subtitle: string;
}> = [
  {
    id: "skip",
    label: "Skip duplicates",
    subtitle: "Existing rows that match the dedup key are left untouched.",
  },
  {
    id: "update",
    label: "Update existing",
    subtitle: "Existing rows are overwritten with the imported fields.",
  },
];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: AC.font,
        fontSize: 11,
        color: AC.mute,
        fontWeight: 700,
        letterSpacing: 0.3,
        textTransform: "uppercase",
        marginBottom: 10,
      }}
    >
      {children}
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: AC.font,
        fontSize: 11.5,
        color: AC.mute,
        marginTop: 10,
        lineHeight: 1.5,
      }}
    >
      {children}
    </div>
  );
}

function ToggleRow({
  title,
  subtitle,
  on,
  saving,
  disabled,
  onChange,
}: {
  title: string;
  subtitle: string;
  on: boolean;
  saving: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  const isOff = !disabled && !on;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => !disabled && !saving && onChange(!on)}
      disabled={disabled || saving}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        width: "100%",
        padding: "8px 4px",
        border: "none",
        background: "transparent",
        cursor: disabled || saving ? "not-allowed" : "pointer",
        textAlign: "left",
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: AC.font,
            fontSize: 13.5,
            fontWeight: 600,
            color: AC.ink,
            letterSpacing: -0.1,
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontFamily: AC.font,
            fontSize: 11.5,
            color: AC.mute,
            marginTop: 3,
            lineHeight: 1.4,
          }}
        >
          {subtitle}
        </div>
      </div>
      <div
        aria-hidden
        style={{
          width: 42,
          height: 24,
          borderRadius: 99,
          background: on ? AC.brand : isOff ? "#cbd5e1" : AC.line,
          position: "relative",
          transition: "background .2s ease",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: 18,
            height: 18,
            borderRadius: "50%",
            background: "#fff",
            position: "absolute",
            top: 3,
            left: on ? 21 : 3,
            transition: "left .2s ease",
            boxShadow: "0 1px 2px rgba(0,0,0,.18)",
            opacity: saving ? 0.6 : 1,
          }}
        />
      </div>
    </button>
  );
}
