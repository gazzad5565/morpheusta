"use client";

/**
 * /settings/import — the single Morpheus Ops import hub.
 *
 * Two tabs in one page (Gary's directive, May 25 — Import only lives
 * under Settings, not as a top-level nav entry):
 *
 *   1. "Run an import" — entity picker grid (5 cards) + Recent
 *      Imports panel reading from import_runs. Tapping a card opens
 *      /settings/import/[entity] for the 5-step wizard.
 *   2. "Defaults" — org-wide duplicate behaviour + welcome-email
 *      defaults. Pre-fills the wizard's Settings step.
 *
 * Tab state is local (no URL param) because both tabs are cheap to
 * render and the user typically flips once at the start of a session.
 *
 * Lives at /settings/import (entry in SETTINGS_SECTIONS). List-page
 * Import buttons across /customers, /reps, /settings/managers,
 * /schedule, and the customer-detail SitesTab link directly to
 * /settings/import/<entity> for a one-tap-to-wizard shortcut, but
 * the hub IS the only home.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { AGlyph } from "@/components/ui/AGlyph";
import { SettingsShell } from "@/components/shell/SettingsShell";
import { AC } from "@/lib/tokens";
import { formatRelative } from "@/lib/format";
import {
  listRecentImports,
  subscribeImportRuns,
  type ImportRunRow,
} from "@/lib/import-runs-store";
import {
  ENTITY_DESCRIPTION,
  ENTITY_LABEL,
  type EntityType,
} from "@/lib/import-types";
import {
  getImportSettings,
  setImportDefaultDuplicateMode,
  setImportSendWelcomeEmailDefault,
  type ImportDuplicateMode,
} from "@/lib/settings-store";

const ENTITIES: EntityType[] = ["customer", "site", "rep", "manager", "shift"];

type TabId = "run" | "defaults";

export default function ImportHubPage() {
  const [tab, setTab] = useState<TabId>("run");

  return (
    <SettingsShell
      section="import"
      description="One place for every bulk upload. Pick the entity, drop a CSV or XLSX, map columns, preview, commit. Switch to Defaults to set the org-wide duplicate behaviour and welcome-email policy."
    >
      <TabBar tab={tab} setTab={setTab} />

      {tab === "run" ? <RunPane /> : <DefaultsPane />}
    </SettingsShell>
  );
}

// ─── Tab bar ────────────────────────────────────────────────────────

function TabBar({
  tab,
  setTab,
}: {
  tab: TabId;
  setTab: (t: TabId) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 4,
        marginBottom: 14,
        padding: 4,
        background: AC.bg,
        borderRadius: 10,
        border: `1px solid ${AC.line}`,
        width: "fit-content",
      }}
    >
      <TabButton active={tab === "run"} onClick={() => setTab("run")}>
        Run an import
      </TabButton>
      <TabButton
        active={tab === "defaults"}
        onClick={() => setTab("defaults")}
      >
        Defaults
      </TabButton>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "8px 16px",
        borderRadius: 8,
        border: "none",
        background: active ? "#fff" : "transparent",
        color: active ? AC.brandInk : AC.mute,
        fontFamily: AC.font,
        fontSize: 13,
        fontWeight: 700,
        cursor: "pointer",
        boxShadow: active
          ? "0 1px 2px rgba(15, 23, 42, 0.06), 0 0 0 1px rgba(15, 23, 42, 0.04)"
          : "none",
      }}
    >
      {children}
    </button>
  );
}

// ─── "Run an import" tab ────────────────────────────────────────────

function RunPane() {
  const [recent, setRecent] = useState<ImportRunRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const rows = await listRecentImports(20);
      if (cancelled) return;
      setRecent(rows);
      setLoaded(true);
    };
    refresh();
    const unsub = subscribeImportRuns(() => refresh());
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Entity picker */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 12,
        }}
      >
        {ENTITIES.map((entity) => (
          <EntityCard key={entity} entity={entity} />
        ))}
      </div>

      {/* Recent imports */}
      <div>
        <div
          style={{
            fontFamily: AC.font,
            fontSize: 14,
            fontWeight: 700,
            color: AC.ink,
            letterSpacing: -0.2,
            marginBottom: 10,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          Recent imports
          <span
            style={{
              fontFamily: AC.font,
              fontSize: 11,
              color: AC.mute,
              fontWeight: 500,
            }}
          >
            · {recent.length}
          </span>
        </div>

        {!loaded ? (
          <Card padding={20}>
            <div style={{ fontFamily: AC.font, fontSize: 13, color: AC.mute }}>
              Loading…
            </div>
          </Card>
        ) : recent.length === 0 ? (
          <Card padding={20}>
            <div
              style={{
                fontFamily: AC.font,
                fontSize: 13,
                color: AC.mute,
                lineHeight: 1.6,
                textAlign: "center",
                padding: "8px 0",
              }}
            >
              No imports yet. Pick an entity above to start your first one.
              <br />
              Once the Phase D adapters land, every commit will surface here
              with live counts.
            </div>
          </Card>
        ) : (
          <Card padding={0}>
            {recent.map((r, i) => (
              <RunRow key={r.id} run={r} isLast={i === recent.length - 1} />
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}

function EntityCard({ entity }: { entity: EntityType }) {
  return (
    <Link
      href={`/settings/import/${entity}`}
      style={{ textDecoration: "none", color: "inherit" }}
    >
      <Card padding={16} style={{ height: "100%" }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
          }}
        >
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
            <AGlyph name={glyphForEntity(entity)} size={18} color={AC.brandDeep} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontFamily: AC.font,
                fontSize: 14,
                fontWeight: 700,
                color: AC.ink,
                letterSpacing: -0.2,
              }}
            >
              {ENTITY_LABEL[entity]}
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
              {ENTITY_DESCRIPTION[entity]}
            </div>
          </div>
          <AGlyph name="chev-r" size={14} color={AC.mute} />
        </div>
      </Card>
    </Link>
  );
}

function RunRow({ run, isLast }: { run: ImportRunRow; isLast: boolean }) {
  const statusTint = STATUS_TINT[run.status];
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "160px 1fr 110px 90px",
        gap: 12,
        alignItems: "center",
        padding: "12px 16px",
        borderBottom: isLast ? "none" : `1px solid ${AC.lineDim}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            padding: "2px 8px",
            borderRadius: 99,
            background: statusTint.bg,
            color: statusTint.fg,
            fontFamily: AC.font,
            fontSize: 10.5,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: 0.4,
          }}
        >
          {run.status}
        </span>
        <span
          style={{
            fontFamily: AC.font,
            fontSize: 12.5,
            color: AC.ink,
            fontWeight: 600,
            textTransform: "capitalize",
          }}
        >
          {run.entity_type}s
        </span>
      </div>
      <div
        style={{
          fontFamily: AC.font,
          fontSize: 12,
          color: AC.mute,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {run.source_filename || "(pasted rows)"}
      </div>
      <div style={{ fontFamily: AC.font, fontSize: 12, color: AC.ink2 }}>
        ✓ {run.created_count} · ↻ {run.updated_count} · ✕ {run.failed_count}
      </div>
      <div
        style={{
          fontFamily: AC.font,
          fontSize: 11,
          color: AC.mute,
          textAlign: "right",
        }}
      >
        {formatRelative(run.started_at, " ago")}
      </div>
    </div>
  );
}

const STATUS_TINT: Record<
  ImportRunRow["status"],
  { bg: string; fg: string }
> = {
  pending: { bg: AC.bg, fg: AC.mute },
  running: { bg: AC.brandSoft, fg: AC.brandInk },
  complete: { bg: AC.okTint, fg: "#0F5A38" },
  failed: { bg: AC.dangerTint, fg: "#9c1a3c" },
};

function glyphForEntity(
  entity: EntityType
): "customer" | "building" | "reps" | "cal" {
  switch (entity) {
    case "customer":
      return "customer";
    case "site":
      return "building";
    case "rep":
    case "manager":
      return "reps";
    case "shift":
      return "cal";
  }
}

// ─── "Defaults" tab ─────────────────────────────────────────────────

function DefaultsPane() {
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
    <>
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
          Resend&apos;s free tier delivers 100 emails / day. A bulk import of
          200 reps with this on will deliver across two days; the import
          itself completes immediately and the failed-delivery rows are
          surfaced on the run&apos;s result screen.
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
    </>
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
