/**
 * File parsers for the import hub.
 *
 * Supports CSV (via Papa Parse) and XLSX (via SheetJS). Both produce
 * the same {headers, rows} shape so downstream code is format-agnostic.
 *
 * Handles a few real-world quirks:
 *   - UTF-8 BOM on Excel-saved CSVs — stripped before Papa sees it.
 *   - Junk rows above the header (e.g. an Excel sheet title row) —
 *     auto-detect the header row by scanning for the first row with
 *     >= 2 non-empty cells.
 *   - Trailing blank rows from Excel — dropped.
 *   - Pasted text in the textarea is treated as CSV.
 */

import Papa from "papaparse";
import * as XLSX from "xlsx";
import type { RawRow } from "./import-types";

export interface ParsedFile {
  headers: string[];
  rows: RawRow[];
}

/** Strip UTF-8 BOM if present. Excel-saved CSVs frequently include
 *  one and Papa otherwise treats it as part of the first column name
 *  ("﻿code" instead of "code"). */
function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

/** Detect the header row in a 2D array. Returns its index — usually 0
 *  but Excel users sometimes put a sheet title in row 0 ("Customer
 *  Export · Q2") with the real headers on row 1 or 2. We scan for the
 *  first row with at least 2 non-empty cells; that's almost always
 *  the header row in real files. */
function detectHeaderRow(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const row = rows[i];
    const nonEmpty = row.filter((c) => (c ?? "").toString().trim().length > 0);
    if (nonEmpty.length >= 2) return i;
  }
  return 0;
}

/** Convert a 2D string array into {headers, rows}. Drops fully-blank
 *  rows. Trims every cell. */
function tableToParsed(table: string[][]): ParsedFile {
  if (table.length === 0) return { headers: [], rows: [] };
  const headerIdx = detectHeaderRow(table);
  const rawHeaders = (table[headerIdx] ?? []).map((h) =>
    (h ?? "").toString().trim()
  );
  // Dedupe blank-string headers by adding _2 / _3 suffixes so an
  // accidentally-empty header column doesn't collapse rows into the
  // same key.
  const seen = new Map<string, number>();
  const headers = rawHeaders.map((h) => {
    const base = h || "column";
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}_${n}`;
  });

  const rows: RawRow[] = [];
  for (let i = headerIdx + 1; i < table.length; i++) {
    const arr = table[i] ?? [];
    const row: RawRow = {};
    let any = false;
    for (let j = 0; j < headers.length; j++) {
      const v = (arr[j] ?? "").toString().trim();
      row[headers[j]] = v;
      if (v) any = true;
    }
    if (any) rows.push(row);
  }
  return { headers, rows };
}

/** Parse CSV text (from File.text() or the paste textarea). */
export function parseCsvText(text: string): ParsedFile {
  const cleaned = stripBom(text);
  // header:false so Papa returns a 2D array; we run our own header
  // detection because Papa's `header: true` mode dies on junk first
  // rows and silently misaligns columns.
  const result = Papa.parse<string[]>(cleaned, {
    header: false,
    skipEmptyLines: "greedy",
  });
  return tableToParsed(result.data);
}

/** Parse a File object — picks CSV vs XLSX based on extension/MIME. */
export async function parseFile(file: File): Promise<ParsedFile> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".csv") || file.type === "text/csv") {
    const text = await file.text();
    return parseCsvText(text);
  }
  if (
    lower.endsWith(".xlsx") ||
    lower.endsWith(".xls") ||
    file.type ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const firstSheet = wb.SheetNames[0];
    if (!firstSheet) return { headers: [], rows: [] };
    const sheet = wb.Sheets[firstSheet];
    // header:1 returns a 2D array of strings (just like Papa with
    // header:false), so the same tableToParsed pipeline works.
    const table = XLSX.utils.sheet_to_json<string[]>(sheet, {
      header: 1,
      raw: false,
      defval: "",
    });
    return tableToParsed(table);
  }
  throw new Error(
    `Unsupported file type: ${file.name}. Use .csv or .xlsx.`
  );
}
