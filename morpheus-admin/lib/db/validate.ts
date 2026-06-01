/**
 * Store-boundary validation (May 29 review — refactor #11).
 *
 * Stores currently cast Supabase results with `data as T[]` — which
 * bypasses all checking, so a renamed/dropped/retyped DB column surfaces
 * as `undefined` downstream and fails SILENTLY (the class of bug behind
 * the May 29 "North" region fix).
 *
 * These helpers parse rows against a zod schema and, CRUCIALLY, degrade
 * gracefully: on a mismatch they LOG the drift loudly and fall back to
 * the raw rows, so adding validation can never become a NEW crash path
 * on otherwise-valid data. It turns a silent cast into an observable
 * one. (Unknown columns are stripped by the schema, not rejected — only
 * a known column with the wrong type / a missing required column counts
 * as drift.)
 */

import { z } from "zod";

/** Validate an array of rows. Logs + degrades to raw on drift. */
export function parseRows<S extends z.ZodTypeAny>(
  elementSchema: S,
  data: unknown,
  tag: string
): z.infer<S>[] {
  const result = z.array(elementSchema).safeParse(data ?? []);
  if (result.success) return result.data;
  // eslint-disable-next-line no-console
  console.warn(
    `[${tag}] DB row drift — using raw rows. First issues:`,
    result.error.issues.slice(0, 3)
  );
  return (Array.isArray(data) ? data : []) as z.infer<S>[];
}

/** Single-row variant for maybeSingle() reads. null in → null out. */
export function parseRow<S extends z.ZodTypeAny>(
  elementSchema: S,
  data: unknown,
  tag: string
): z.infer<S> | null {
  if (data == null) return null;
  const result = elementSchema.safeParse(data);
  if (result.success) return result.data;
  // eslint-disable-next-line no-console
  console.warn(
    `[${tag}] DB row drift — using raw row. First issues:`,
    result.error.issues.slice(0, 3)
  );
  return data as z.infer<S>;
}
