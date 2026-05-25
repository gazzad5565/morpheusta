"use client";

/**
 * /import — the bulk import hub.
 *
 * Single entry point for every bulk-import flow in the admin. Top
 * section is a picker grid (Customers / Sites / Reps / Managers /
 * Shifts) — tapping a card opens /import/<entity>. Bottom section is
 * a "Recent imports" panel reading from import_runs (Phase A migration).
 *
 * Phase C ships the hub UI shell + per-entity stepper at /import/[entity].
 * Adapter writes (Commit button actually doing anything) land in Phase D.
 *
 * Consolidation rule (Gary's directive, May 25): every "Import" CTA in
 * the admin (sidebar Import nav link, list-page "Import" buttons on
 * /customers, /reps, /settings/managers, /schedule) routes here, NOT
 * to per-page upload widgets. One hub, all imports.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/shell/AdminShell";
import { Card } from "@/components/ui/Card";
import { AGlyph } from "@/components/ui/AGlyph";
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

const ENTITIES: EntityType[] = ["customer", "site", "rep", "manager", "shift"];

export default function ImportHubPage() {
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
    <AdminShell breadcrumbs={["Home", "Import"]}>
      <div
        style={{
          padding: 20,
          display: "flex",
          flexDirection: "column",
          gap: 24,
          maxWidth: 1120,
        }}
      >
        {/* ─── Intro ─────────────────────────────────────────── */}
        <div>
          <div
            style={{
              fontFamily: AC.font,
              fontSize: 22,
              fontWeight: 700,
              color: AC.ink,
              letterSpacing: -0.4,
            }}
          >
            Bulk import
          </div>
          <div
            style={{
              fontFamily: AC.font,
              fontSize: 13,
              color: AC.mute,
              marginTop: 6,
              lineHeight: 1.5,
              maxWidth: 720,
            }}
          >
            One place for every bulk upload. Pick what you&apos;re
            importing, drop a CSV or XLSX, map columns, preview, commit.
            Defaults (duplicate behaviour, welcome email on user import)
            live at{" "}
            <Link
              href="/settings/import"
              style={{ color: AC.brandDeep, textDecoration: "none" }}
            >
              Settings → Import
            </Link>
            .
          </div>
        </div>

        {/* ─── Entity picker ─────────────────────────────────── */}
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

        {/* ─── Recent imports ────────────────────────────────── */}
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
                <RunRow
                  key={r.id}
                  run={r}
                  isLast={i === recent.length - 1}
                />
              ))}
            </Card>
          )}
        </div>
      </div>
    </AdminShell>
  );
}

function EntityCard({ entity }: { entity: EntityType }) {
  return (
    <Link
      href={`/import/${entity}`}
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

function glyphForEntity(entity: EntityType): "customer" | "building" | "reps" | "cal" {
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
