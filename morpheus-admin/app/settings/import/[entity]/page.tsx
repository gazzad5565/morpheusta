"use client";

/**
 * /import/[entity] — the 5-step bulk import wizard.
 *
 * Steps: Source → Map columns → Settings → Preview → Result. The
 * page is entity-agnostic: it loads an ImportAdapter for the entity
 * from the registry and drives the flow from the adapter's
 * declarative shape (requiredFields, fieldLabels, dedupKey,
 * validate). Adapter.upsert() is currently a Phase-D stub that
 * throws "not implemented" — the wizard exposes that as a clean
 * "writes aren't wired up yet" message on the Result step.
 *
 * Phase D will replace the stub adapters with real ones — the page
 * doesn't change.
 */

import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import { AdminShell } from "@/components/shell/AdminShell";
import { Btn } from "@/components/ui/Btn";
import { Card } from "@/components/ui/Card";
import { AGlyph } from "@/components/ui/AGlyph";
import { AC } from "@/lib/tokens";
import { getImportSettings, type ImportDuplicateMode } from "@/lib/settings-store";
import {
  ENTITY_LABEL,
  STEP_LABEL,
  STEP_ORDER,
  type EntityType,
  type PreviewRow,
  type RawRow,
  type StepId,
} from "@/lib/import-types";
import { parseCsvText, parseFile, type ParsedFile } from "@/lib/import-parsers";
import { autoMap } from "@/lib/import-synonyms";
import { getAdapter, normalizeRow } from "@/lib/import-adapter-registry";

const VALID_ENTITIES: EntityType[] = [
  "customer",
  "site",
  "rep",
  "manager",
  "shift",
];

function isEntity(s: string): s is EntityType {
  return (VALID_ENTITIES as string[]).includes(s);
}

export default function EntityImportPage({
  params,
}: {
  params: Promise<{ entity: string }>;
}) {
  const { entity: entityParam } = use(params);
  if (!isEntity(entityParam)) {
    return (
      <AdminShell breadcrumbs={["Home", "Settings", "Import", "Not found"]}>
        <div style={{ padding: 32 }}>
          <Card padding={24}>
            <div
              style={{
                fontFamily: AC.font,
                fontSize: 14,
                color: AC.ink,
                marginBottom: 12,
              }}
            >
              No importable entity called <code>{entityParam}</code>. Pick one
              from the hub.
            </div>
            <Link href="/settings/import" style={{ textDecoration: "none" }}>
              <Btn>← Back to import hub</Btn>
            </Link>
          </Card>
        </div>
      </AdminShell>
    );
  }
  return <Wizard entity={entityParam} />;
}

function Wizard({ entity }: { entity: EntityType }) {
  const adapter = getAdapter(entity);
  const allFields = [...adapter.requiredFields, ...adapter.optionalFields];

  // ── Step state ──────────────────────────────────────────────────
  const [step, setStep] = useState<StepId>("source");
  const [filename, setFilename] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [pasteText, setPasteText] = useState("");
  const [dragOver, setDragOver] = useState(false);

  // ── Mapping state ───────────────────────────────────────────────
  const [mapping, setMapping] = useState<Record<string, string>>({});

  // ── Settings state ──────────────────────────────────────────────
  const [duplicateMode, setDuplicateMode] = useState<ImportDuplicateMode>("skip");
  const [sendWelcomeEmail, setSendWelcomeEmail] = useState(true);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // ── Preview + result state ──────────────────────────────────────
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    created: number;
    updated: number;
    skipped: number;
    failed: number;
  } | null>(null);

  // Fetch the org's import defaults on mount → seeds the Settings step.
  useEffect(() => {
    getImportSettings().then((s) => {
      setDuplicateMode(s.duplicateMode);
      setSendWelcomeEmail(s.sendWelcomeEmail);
      setSettingsLoaded(true);
    });
  }, []);

  // ── Parsing ─────────────────────────────────────────────────────
  const handleParsed = (p: ParsedFile, source: string | null) => {
    setParsed(p);
    setFilename(source);
    setParseError(null);
    setMapping(autoMap(entity, p.headers));
  };

  const onPickFile = async (file: File) => {
    setParseError(null);
    try {
      const p = await parseFile(file);
      if (p.rows.length === 0) {
        setParseError(
          "Parsed but found 0 data rows. Check the file has a header row and at least one row of data."
        );
        return;
      }
      handleParsed(p, file.name);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : String(e));
    }
  };

  const onPasteSubmit = () => {
    if (!pasteText.trim()) return;
    setParseError(null);
    try {
      const p = parseCsvText(pasteText);
      if (p.rows.length === 0) {
        setParseError(
          "No data rows found in the pasted text. First row must be headers."
        );
        return;
      }
      handleParsed(p, "(pasted rows)");
    } catch (e) {
      setParseError(e instanceof Error ? e.message : String(e));
    }
  };

  // ── Step navigation ─────────────────────────────────────────────
  const canAdvance = useMemo(() => {
    if (step === "source") return parsed !== null && parsed.rows.length > 0;
    if (step === "map") {
      return adapter.requiredFields.every((f) => mapping[f]);
    }
    if (step === "settings") return settingsLoaded;
    if (step === "preview") return !committing;
    return false;
  }, [step, parsed, mapping, adapter.requiredFields, settingsLoaded, committing]);

  const goNext = () => {
    const idx = STEP_ORDER.indexOf(step);
    const next = STEP_ORDER[idx + 1];
    if (!next) return;
    if (next === "preview") computePreview();
    setStep(next);
  };

  const goBack = () => {
    const idx = STEP_ORDER.indexOf(step);
    const prev = STEP_ORDER[idx - 1];
    if (prev) setStep(prev);
  };

  // ── Preview computation ─────────────────────────────────────────
  const computePreview = () => {
    if (!parsed) return;
    const seenKeys = new Set<string>();
    const rows: PreviewRow[] = parsed.rows.map((raw, i) => {
      const normalized = normalizeRow(raw, mapping);
      const errors = adapter.validate(normalized);
      const key = adapter.dedupKey(normalized);
      // In Phase C we have no live DB lookup — duplicate detection is
      // only "this file has two rows with the same key". Phase D's
      // adapter.upsert will do the real DB-side dup check.
      const isDuplicate = seenKeys.has(key);
      if (key) seenKeys.add(key);
      let predicted: PreviewRow["predicted"];
      if (errors.length > 0) predicted = "fail";
      else if (isDuplicate)
        predicted = duplicateMode === "skip" ? "skip" : "update";
      else predicted = "create";
      return { rowIndex: i, raw, normalized, errors, isDuplicate, predicted };
    });
    setPreview(rows);
  };

  // Re-compute preview when duplicate mode toggles AFTER the user
  // arrives on the Preview step (so the create/update/skip headline
  // stays truthful).
  useEffect(() => {
    if (step === "preview") computePreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duplicateMode, step]);

  // ── Commit ──────────────────────────────────────────────────────
  const onCommit = async () => {
    if (committing) return;
    setCommitting(true);
    setCommitError(null);
    let created = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;
    try {
      for (const row of preview) {
        if (row.predicted === "fail") {
          failed += 1;
          continue;
        }
        try {
          const outcome = await adapter.upsert(row.normalized, duplicateMode);
          if (outcome === "created") created += 1;
          else if (outcome === "updated") updated += 1;
          else if (outcome === "skipped") skipped += 1;
          else failed += 1;
        } catch (e) {
          // Phase C: every adapter.upsert throws — surface that error
          // up to the page-level commitError so we don't pretend the
          // import succeeded.
          throw e;
        }
      }
      setResult({ created, updated, skipped, failed });
    } catch (e) {
      setCommitError(e instanceof Error ? e.message : String(e));
    } finally {
      setCommitting(false);
      setStep("result");
    }
  };

  // ── Counts shown on Preview ─────────────────────────────────────
  const counts = useMemo(() => {
    const c = { create: 0, update: 0, skip: 0, fail: 0 };
    for (const r of preview) c[r.predicted] += 1;
    return c;
  }, [preview]);

  // ── Render ──────────────────────────────────────────────────────
  return (
    <AdminShell
      breadcrumbs={["Home", "Settings", "Import", ENTITY_LABEL[entity]]}
      actions={
        <Link href="/settings/import" style={{ textDecoration: "none" }}>
          <Btn size="sm">← All entities</Btn>
        </Link>
      }
    >
      <div
        style={{
          padding: 20,
          display: "flex",
          flexDirection: "column",
          gap: 16,
          maxWidth: 920,
        }}
      >
        <Stepper current={step} />

        {step === "source" && (
          <SourceStep
            entity={entity}
            parsed={parsed}
            filename={filename}
            parseError={parseError}
            pasteText={pasteText}
            setPasteText={setPasteText}
            onPickFile={onPickFile}
            onPasteSubmit={onPasteSubmit}
            dragOver={dragOver}
            setDragOver={setDragOver}
            onReset={() => {
              setParsed(null);
              setFilename(null);
              setMapping({});
              setPasteText("");
              setParseError(null);
            }}
          />
        )}

        {step === "map" && parsed && (
          <MapStep
            entity={entity}
            adapter={adapter}
            allFields={allFields}
            headers={parsed.headers}
            mapping={mapping}
            setMapping={setMapping}
          />
        )}

        {step === "settings" && (
          <SettingsStep
            entity={entity}
            settingsLoaded={settingsLoaded}
            duplicateMode={duplicateMode}
            setDuplicateMode={setDuplicateMode}
            sendWelcomeEmail={sendWelcomeEmail}
            setSendWelcomeEmail={setSendWelcomeEmail}
          />
        )}

        {step === "preview" && (
          <PreviewStep counts={counts} preview={preview} headers={allFields} />
        )}

        {step === "result" && (
          <ResultStep
            result={result}
            commitError={commitError}
            failures={preview.filter((r) => r.predicted === "fail")}
            allFields={allFields}
          />
        )}

        {/* ── Footer nav ─────────────────────────────────────── */}
        {step !== "result" && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 8,
              paddingTop: 8,
            }}
          >
            <Btn onClick={goBack} disabled={step === "source"}>
              ← Back
            </Btn>
            {step === "preview" ? (
              <Btn
                kind="primary"
                onClick={onCommit}
                disabled={!canAdvance || committing || counts.fail === preview.length}
              >
                {committing ? "Committing…" : "Commit import →"}
              </Btn>
            ) : (
              <Btn kind="primary" onClick={goNext} disabled={!canAdvance}>
                Next →
              </Btn>
            )}
          </div>
        )}
      </div>
    </AdminShell>
  );
}

// ─── Stepper bar ────────────────────────────────────────────────────

function Stepper({ current }: { current: StepId }) {
  const currentIdx = STEP_ORDER.indexOf(current);
  return (
    <Card padding={12}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {STEP_ORDER.map((s, i) => {
          const done = i < currentIdx;
          const active = i === currentIdx;
          return (
            <div
              key={s}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                flex: 1,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 10px",
                  borderRadius: 8,
                  background: active ? AC.brandSoft : "transparent",
                }}
              >
                <div
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 99,
                    background: done ? AC.ok : active ? AC.brand : AC.line,
                    color: "#fff",
                    fontFamily: AC.font,
                    fontSize: 11,
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {done ? "✓" : i + 1}
                </div>
                <span
                  style={{
                    fontFamily: AC.font,
                    fontSize: 12.5,
                    fontWeight: active ? 700 : 600,
                    color: active ? AC.brandInk : done ? AC.ok : AC.mute,
                    letterSpacing: -0.1,
                  }}
                >
                  {STEP_LABEL[s]}
                </span>
              </div>
              {i < STEP_ORDER.length - 1 && (
                <div
                  style={{
                    flex: 1,
                    height: 1,
                    background: done ? AC.ok : AC.line,
                    opacity: done ? 0.5 : 1,
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ─── Step 1: Source ─────────────────────────────────────────────────

function SourceStep({
  entity,
  parsed,
  filename,
  parseError,
  pasteText,
  setPasteText,
  onPickFile,
  onPasteSubmit,
  dragOver,
  setDragOver,
  onReset,
}: {
  entity: EntityType;
  parsed: ParsedFile | null;
  filename: string | null;
  parseError: string | null;
  pasteText: string;
  setPasteText: (s: string) => void;
  onPickFile: (f: File) => Promise<void>;
  onPasteSubmit: () => void;
  dragOver: boolean;
  setDragOver: (b: boolean) => void;
  onReset: () => void;
}) {
  return (
    <Card padding={20}>
      <SectionLabel>Pick a CSV or XLSX file</SectionLabel>

      {parsed ? (
        <div
          style={{
            padding: 16,
            background: AC.okTint,
            color: "#0F5A38",
            borderRadius: 10,
            fontFamily: AC.font,
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div>
            ✓ Parsed <b>{filename}</b> — {parsed.rows.length} row
            {parsed.rows.length === 1 ? "" : "s"}, {parsed.headers.length}{" "}
            column{parsed.headers.length === 1 ? "" : "s"}.
          </div>
          <Btn size="sm" onClick={onReset}>
            Pick a different file
          </Btn>
        </div>
      ) : (
        <>
          <label
            htmlFor="import-file"
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f) onPickFile(f);
            }}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "32px 20px",
              border: `2px dashed ${dragOver ? AC.brand : AC.line}`,
              borderRadius: 12,
              background: dragOver ? AC.brandSoft : AC.bg,
              cursor: "pointer",
              transition: "all .15s ease",
            }}
          >
            <AGlyph name="upload" size={28} color={AC.mute} />
            <div
              style={{
                marginTop: 10,
                fontFamily: AC.font,
                fontSize: 13.5,
                fontWeight: 600,
                color: AC.ink,
              }}
            >
              Drop a file here, or click to browse
            </div>
            <div
              style={{
                marginTop: 4,
                fontFamily: AC.font,
                fontSize: 11.5,
                color: AC.mute,
              }}
            >
              .csv or .xlsx · up to ~100,000 rows
            </div>
            <input
              id="import-file"
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onPickFile(f);
              }}
              style={{ display: "none" }}
            />
          </label>

          <div
            style={{
              fontFamily: AC.font,
              fontSize: 11,
              color: AC.mute,
              margin: "14px 0 6px 0",
              textTransform: "uppercase",
              fontWeight: 700,
              letterSpacing: 0.4,
            }}
          >
            Or paste rows below
          </div>
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder="header1,header2,header3
value1,value2,value3
..."
            style={{
              width: "100%",
              minHeight: 100,
              padding: "10px 12px",
              borderRadius: 10,
              border: `1px solid ${AC.line}`,
              background: "#fff",
              fontFamily: AC.fontMono,
              fontSize: 12.5,
              color: AC.ink,
              resize: "vertical",
              boxSizing: "border-box",
            }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
            <Btn size="sm" onClick={onPasteSubmit} disabled={!pasteText.trim()}>
              Parse pasted rows
            </Btn>
          </div>
        </>
      )}

      {parseError && (
        <div
          style={{
            marginTop: 14,
            padding: "10px 12px",
            background: AC.dangerTint,
            color: "#9c1a3c",
            borderRadius: 10,
            fontFamily: AC.font,
            fontSize: 12.5,
          }}
        >
          ✕ {parseError}
        </div>
      )}

      <div
        style={{
          marginTop: 14,
          padding: 12,
          borderRadius: 10,
          background: AC.bg,
          fontFamily: AC.font,
          fontSize: 11.5,
          color: AC.mute,
          lineHeight: 1.5,
        }}
      >
        Need a starting point?{" "}
        <a
          href={`/import-templates/${entity}s.csv`}
          download
          style={{ color: AC.brandDeep, textDecoration: "none", fontWeight: 600 }}
        >
          Download the sample {ENTITY_LABEL[entity].toLowerCase()} template
        </a>{" "}
        — has the exact column headers we expect, with 2-3 example rows you can
        delete before uploading yours.
      </div>
    </Card>
  );
}

// ─── Step 2: Map columns ────────────────────────────────────────────

function MapStep({
  adapter,
  allFields,
  headers,
  mapping,
  setMapping,
}: {
  entity: EntityType;
  adapter: ReturnType<typeof getAdapter>;
  allFields: string[];
  headers: string[];
  mapping: Record<string, string>;
  setMapping: (m: Record<string, string>) => void;
}) {
  const setField = (field: string, header: string) => {
    setMapping({ ...mapping, [field]: header });
  };
  const missing = adapter.requiredFields.filter((f) => !mapping[f]);

  return (
    <Card padding={20}>
      <SectionLabel>Map your columns to our fields</SectionLabel>
      <div
        style={{
          fontFamily: AC.font,
          fontSize: 12,
          color: AC.mute,
          marginBottom: 14,
          lineHeight: 1.5,
        }}
      >
        We auto-matched what we could from common header names. Pick from your
        file&apos;s headers for any field that didn&apos;t auto-match — or leave
        an optional one as <i>Ignore</i>.
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {allFields.map((field) => {
          const required = adapter.requiredFields.includes(field);
          const current = mapping[field] || "";
          const label = adapter.fieldLabels[field] || field;
          return (
            <div
              key={field}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
                alignItems: "center",
                padding: "10px 12px",
                borderRadius: 10,
                background:
                  required && !current ? AC.dangerTint : AC.bg,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: AC.font,
                    fontSize: 13,
                    fontWeight: 600,
                    color: AC.ink,
                  }}
                >
                  {label}
                  {required && (
                    <span style={{ color: AC.danger, marginLeft: 4 }}>*</span>
                  )}
                </div>
                <div
                  style={{
                    fontFamily: AC.fontMono,
                    fontSize: 11,
                    color: AC.mute,
                    marginTop: 2,
                  }}
                >
                  {field}
                </div>
              </div>
              <select
                value={current}
                onChange={(e) => setField(field, e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: `1px solid ${current ? AC.line : AC.danger}`,
                  background: "#fff",
                  fontFamily: AC.font,
                  fontSize: 13,
                  color: AC.ink,
                  boxSizing: "border-box",
                }}
              >
                <option value="">
                  {required ? "— pick a column —" : "(ignore)"}
                </option>
                {headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>

      {missing.length > 0 && (
        <div
          style={{
            marginTop: 12,
            padding: "10px 12px",
            background: AC.dangerTint,
            color: "#9c1a3c",
            borderRadius: 10,
            fontFamily: AC.font,
            fontSize: 12.5,
          }}
        >
          Still need to map: <b>{missing.join(", ")}</b>. Pick a column for each
          before you can continue.
        </div>
      )}
    </Card>
  );
}

// ─── Step 3: Settings ───────────────────────────────────────────────

function SettingsStep({
  entity,
  settingsLoaded,
  duplicateMode,
  setDuplicateMode,
  sendWelcomeEmail,
  setSendWelcomeEmail,
}: {
  entity: EntityType;
  settingsLoaded: boolean;
  duplicateMode: ImportDuplicateMode;
  setDuplicateMode: (m: ImportDuplicateMode) => void;
  sendWelcomeEmail: boolean;
  setSendWelcomeEmail: (b: boolean) => void;
}) {
  const showWelcome = entity === "rep" || entity === "manager";
  return (
    <Card padding={20}>
      <SectionLabel>Duplicate behaviour for this import</SectionLabel>
      <div
        style={{
          fontFamily: AC.font,
          fontSize: 12,
          color: AC.mute,
          marginBottom: 12,
          lineHeight: 1.5,
        }}
      >
        Defaults from{" "}
        <Link
          href="/settings/import"
          style={{ color: AC.brandDeep, textDecoration: "none" }}
        >
          Settings → Import
        </Link>
        . Override here just for this run.
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {(["skip", "update"] as ImportDuplicateMode[]).map((mode) => {
          const active = duplicateMode === mode;
          return (
            <button
              key={mode}
              type="button"
              onClick={() => setDuplicateMode(mode)}
              disabled={!settingsLoaded}
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
              }}
            >
              <div>
                {mode === "skip" ? "Skip duplicates" : "Update existing"}
              </div>
              <div
                style={{
                  fontSize: 11.5,
                  fontWeight: 500,
                  opacity: 0.9,
                  marginTop: 3,
                  lineHeight: 1.4,
                }}
              >
                {mode === "skip"
                  ? "Existing rows with the same key are left untouched."
                  : "Existing rows with the same key are overwritten."}
              </div>
            </button>
          );
        })}
      </div>

      {showWelcome && (
        <>
          <div style={{ height: 1, background: AC.line, margin: "20px 0" }} />
          <SectionLabel>Welcome email</SectionLabel>
          <label
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              padding: "10px 12px",
              borderRadius: 10,
              background: AC.bg,
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={sendWelcomeEmail}
              onChange={(e) => setSendWelcomeEmail(e.target.checked)}
              style={{
                width: 16,
                height: 16,
                accentColor: AC.brand,
                marginTop: 2,
              }}
            />
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontFamily: AC.font,
                  fontSize: 13,
                  fontWeight: 600,
                  color: AC.ink,
                }}
              >
                Send a welcome email to each user created
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
                Resend free tier delivers 100 emails / day. Credentials always
                appear in the run&apos;s success CSV regardless of this toggle.
              </div>
            </div>
          </label>
        </>
      )}
    </Card>
  );
}

// ─── Step 4: Preview ────────────────────────────────────────────────

function PreviewStep({
  counts,
  preview,
  headers,
}: {
  counts: Record<"create" | "update" | "skip" | "fail", number>;
  preview: PreviewRow[];
  headers: string[];
}) {
  return (
    <>
      <Card padding={20}>
        <SectionLabel>Preview</SectionLabel>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <CountPill label="Create" count={counts.create} tint="ok" />
          <CountPill label="Update" count={counts.update} tint="brand" />
          <CountPill label="Skip" count={counts.skip} tint="neutral" />
          <CountPill label="Fail" count={counts.fail} tint="danger" />
        </div>
        <div
          style={{
            fontFamily: AC.font,
            fontSize: 11.5,
            color: AC.mute,
            marginTop: 10,
            lineHeight: 1.5,
          }}
        >
          Showing the first 10 of {preview.length} parsed rows. Hit{" "}
          <b style={{ color: AC.ink2 }}>Commit import</b> to run the full set.
        </div>
      </Card>

      <Card padding={0}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `60px 90px repeat(${headers.length}, minmax(120px, 1fr))`,
            gap: 0,
            fontFamily: AC.font,
            fontSize: 11,
            color: AC.mute,
            fontWeight: 700,
            letterSpacing: 0.3,
            textTransform: "uppercase",
            padding: "10px 12px",
            background: AC.bg,
            borderBottom: `1px solid ${AC.line}`,
            overflowX: "auto",
          }}
        >
          <div>Row</div>
          <div>State</div>
          {headers.map((h) => (
            <div key={h} style={{ paddingLeft: 8 }}>
              {h}
            </div>
          ))}
        </div>
        {preview.slice(0, 10).map((row) => (
          <PreviewRowDisplay key={row.rowIndex} row={row} headers={headers} />
        ))}
        {preview.length === 0 && (
          <div
            style={{
              padding: 24,
              textAlign: "center",
              fontFamily: AC.font,
              fontSize: 13,
              color: AC.mute,
            }}
          >
            No rows parsed.
          </div>
        )}
      </Card>
    </>
  );
}

function PreviewRowDisplay({
  row,
  headers,
}: {
  row: PreviewRow;
  headers: string[];
}) {
  const tint = STATE_TINT[row.predicted];
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `60px 90px repeat(${headers.length}, minmax(120px, 1fr))`,
        alignItems: "start",
        padding: "10px 12px",
        borderBottom: `1px solid ${AC.lineDim}`,
        background: row.predicted === "fail" ? "#fff5f7" : "#fff",
      }}
    >
      <div
        style={{
          fontFamily: AC.fontMono,
          fontSize: 12,
          color: AC.mute,
        }}
      >
        #{row.rowIndex + 1}
      </div>
      <div>
        <span
          style={{
            padding: "2px 8px",
            borderRadius: 99,
            background: tint.bg,
            color: tint.fg,
            fontFamily: AC.font,
            fontSize: 10.5,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: 0.4,
          }}
        >
          {row.predicted}
        </span>
        {row.errors.length > 0 && (
          <div
            style={{
              fontFamily: AC.font,
              fontSize: 10.5,
              color: "#9c1a3c",
              marginTop: 4,
              lineHeight: 1.4,
            }}
          >
            {row.errors.join("; ")}
          </div>
        )}
      </div>
      {headers.map((h) => (
        <div
          key={h}
          style={{
            paddingLeft: 8,
            fontFamily: AC.font,
            fontSize: 12,
            color: AC.ink,
            wordBreak: "break-word",
          }}
        >
          {row.normalized[h] || (
            <span style={{ color: AC.faint }}>—</span>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Step 5: Result ─────────────────────────────────────────────────

function ResultStep({
  result,
  commitError,
  failures,
  allFields,
}: {
  result: { created: number; updated: number; skipped: number; failed: number } | null;
  commitError: string | null;
  failures: PreviewRow[];
  allFields: string[];
}) {
  const downloadFailures = () => {
    if (failures.length === 0) return;
    const header = ["row_index", ...allFields, "_errors"].join(",");
    const lines = failures.map((row) => {
      const cells = [
        row.rowIndex + 1,
        ...allFields.map((f) => csvCell(row.normalized[f] ?? "")),
        csvCell(row.errors.join("; ")),
      ];
      return cells.join(",");
    });
    const csv = [header, ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "import-failures.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (commitError) {
    return (
      <Card padding={24}>
        <div
          style={{
            fontFamily: AC.font,
            fontSize: 15,
            fontWeight: 700,
            color: AC.ink,
            marginBottom: 8,
          }}
        >
          Commit failed
        </div>
        <div
          style={{
            padding: "12px 14px",
            background: AC.dangerTint,
            color: "#9c1a3c",
            borderRadius: 10,
            fontFamily: AC.font,
            fontSize: 13,
            lineHeight: 1.55,
            marginBottom: 14,
          }}
        >
          {commitError}
        </div>
        <Link href="/settings/import" style={{ textDecoration: "none" }}>
          <Btn>← Back to import hub</Btn>
        </Link>
      </Card>
    );
  }

  if (!result) {
    return (
      <Card padding={24}>
        <div style={{ fontFamily: AC.font, fontSize: 13, color: AC.mute }}>
          No result to show.
        </div>
      </Card>
    );
  }

  return (
    <>
      <Card padding={24}>
        <div
          style={{
            fontFamily: AC.font,
            fontSize: 18,
            fontWeight: 700,
            color: AC.ink,
            letterSpacing: -0.3,
          }}
        >
          ✓ Import complete
        </div>
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            marginTop: 14,
          }}
        >
          <CountPill label="Created" count={result.created} tint="ok" />
          <CountPill label="Updated" count={result.updated} tint="brand" />
          <CountPill label="Skipped" count={result.skipped} tint="neutral" />
          <CountPill label="Failed" count={result.failed} tint="danger" />
        </div>
        <div
          style={{
            display: "flex",
            gap: 8,
            marginTop: 18,
          }}
        >
          {failures.length > 0 && (
            <Btn icon="download" onClick={downloadFailures}>
              Download failures CSV ({failures.length})
            </Btn>
          )}
          <Link href="/settings/import" style={{ textDecoration: "none" }}>
            <Btn kind="primary">Start another import</Btn>
          </Link>
        </div>
      </Card>
    </>
  );
}

// ─── Shared bits ────────────────────────────────────────────────────

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

function CountPill({
  label,
  count,
  tint,
}: {
  label: string;
  count: number;
  tint: "ok" | "brand" | "neutral" | "danger";
}) {
  const t = COUNT_TINT[tint];
  return (
    <div
      style={{
        padding: "8px 14px",
        borderRadius: 10,
        background: t.bg,
        color: t.fg,
        fontFamily: AC.font,
        fontSize: 13,
        fontWeight: 700,
        display: "flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      <span style={{ fontSize: 18, fontWeight: 800 }}>{count}</span>
      <span style={{ opacity: 0.85, fontWeight: 600 }}>{label}</span>
    </div>
  );
}

const COUNT_TINT: Record<
  "ok" | "brand" | "neutral" | "danger",
  { bg: string; fg: string }
> = {
  ok: { bg: AC.okTint, fg: "#0F5A38" },
  brand: { bg: AC.brandSoft, fg: AC.brandInk },
  neutral: { bg: AC.bg, fg: AC.mute },
  danger: { bg: AC.dangerTint, fg: "#9c1a3c" },
};

const STATE_TINT: Record<
  "create" | "update" | "skip" | "fail",
  { bg: string; fg: string }
> = {
  create: { bg: AC.okTint, fg: "#0F5A38" },
  update: { bg: AC.brandSoft, fg: AC.brandInk },
  skip: { bg: AC.bg, fg: AC.mute },
  fail: { bg: AC.dangerTint, fg: "#9c1a3c" },
};

function csvCell(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
