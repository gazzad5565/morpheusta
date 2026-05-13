"use client";

/**
 * AddressAutocomplete (mobile) — May 13.
 *
 * Mobile-styled twin of the admin's component. Wraps a single-line
 * input + debounced /api/geocode/suggest call + a dropdown of up to
 * 6 Nominatim matches. Picking one fires `onSelect` with the
 * resolved lat/lng — the parent decides what to do with it (on
 * /add-customer we capture both the displayName as the address
 * text AND the coords as the pin, so the rep gets the pin "for
 * free" just by picking from the list).
 *
 * Touch-tuned: rows are 48 px tall (matches Apple HIG min), font
 * is 14 px for readability while typing, dropdown has a generous
 * shadow so it reads above whatever is below.
 */

import { useEffect, useRef, useState } from "react";
import { MC } from "@/lib/tokens";

interface Suggestion {
  id: string | number;
  latitude: number;
  longitude: number;
  displayName: string;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSelect: (s: Suggestion) => void;
  placeholder?: string;
  autoFocus?: boolean;
}

const DEBOUNCE_MS = 350;
const MIN_QUERY = 3;

export function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder,
  autoFocus,
}: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Suggestion[]>([]);
  const [highlight, setHighlight] = useState(-1);
  // Surface failures explicitly in the dropdown so the rep isn't
  // left wondering "did it search?" — distinguishes a network /
  // service error from a genuine "no matches" empty result.
  const [fetchError, setFetchError] = useState<string | null>(null);
  const lastQueryRef = useRef<string>("");

  // Debounced lookup — fires 350 ms after the rep stops typing,
  // and only when the trimmed query has at least 3 chars to avoid
  // burning Nominatim quota on partial words.
  //
  // Identical request shape to the admin's /api/geocode/suggest
  // route (same params, same upstream Nominatim endpoint). So
  // anything that returns a match in admin should return one here
  // too — and vice versa. If a rep reports "my address didn't
  // surface", the issue is upstream (Nominatim didn't index it)
  // not a divergence between the two apps.
  useEffect(() => {
    const q = value.trim();
    if (q.length < MIN_QUERY) {
      setResults([]);
      setLoading(false);
      setFetchError(null);
      return;
    }
    if (q === lastQueryRef.current) return;

    const handle = setTimeout(async () => {
      lastQueryRef.current = q;
      setLoading(true);
      setFetchError(null);
      try {
        const res = await fetch(
          `/api/geocode/suggest?q=${encodeURIComponent(q)}`
        );
        if (!res.ok) {
          // eslint-disable-next-line no-console
          console.warn(
            "[geocode] suggest fetch failed",
            res.status,
            res.statusText
          );
          setResults([]);
          setFetchError(
            res.status === 502
              ? "Address service is busy — try again in a moment."
              : `Address service returned ${res.status}.`
          );
          return;
        }
        const data = (await res.json()) as { results: Suggestion[] };
        setResults(data.results ?? []);
        setHighlight(-1);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("[geocode] suggest threw", err);
        setResults([]);
        setFetchError("Couldn't reach the address service — check your connection.");
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(handle);
  }, [value]);

  // Close on outside tap. Mobile-safe — uses both mousedown and
  // touchstart so iOS Safari closes the dropdown on tap-outside
  // without waiting for the click event.
  useEffect(() => {
    function handleOutside(e: MouseEvent | TouchEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, []);

  function pick(s: Suggestion) {
    onChange(s.displayName);
    onSelect(s);
    setOpen(false);
    setResults([]);
    lastQueryRef.current = s.displayName;
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      if (highlight >= 0 && highlight < results.length) {
        e.preventDefault();
        pick(results[highlight]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "0 12px",
    height: 44,
    fontSize: 15,
    fontFamily: MC.font,
    color: MC.ink,
    background: "#fff",
    border: `1px solid ${MC.line}`,
    borderRadius: 11,
    outline: "none",
  };

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <input
        type="text"
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        style={inputStyle}
        autoComplete="off"
        inputMode="text"
        // Mobile keyboards: hint at "search" so the rep gets a Search
        // key on the keyboard, which dismisses the keyboard cleanly
        // when they're done.
        enterKeyHint="search"
      />
      {open &&
        (loading || results.length > 0 || value.trim().length >= MIN_QUERY) && (
          <div
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              right: 0,
              marginTop: 4,
              background: "#fff",
              border: `1px solid ${MC.line}`,
              borderRadius: 12,
              boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
              zIndex: 50,
              maxHeight: 320,
              overflowY: "auto",
              WebkitOverflowScrolling: "touch",
            }}
          >
            {loading && (
              <div
                style={{
                  padding: "12px 14px",
                  fontFamily: MC.font,
                  fontSize: 13,
                  color: MC.mute,
                }}
              >
                Searching…
              </div>
            )}
            {!loading &&
              fetchError && (
                <div
                  style={{
                    padding: "12px 14px",
                    fontFamily: MC.font,
                    fontSize: 13,
                    color: "#9c1a3c",
                    lineHeight: 1.4,
                  }}
                >
                  {fetchError}
                </div>
              )}
            {!loading &&
              !fetchError &&
              results.length === 0 &&
              value.trim().length >= MIN_QUERY && (
                <div
                  style={{
                    padding: "12px 14px",
                    fontFamily: MC.font,
                    fontSize: 13,
                    color: MC.mute,
                    lineHeight: 1.4,
                  }}
                >
                  No matches for &ldquo;{value.trim()}&rdquo;. Try a
                  shorter version (e.g. just the street + city), or
                  tap &ldquo;Geocode what I typed&rdquo; below — the
                  manual lookup sometimes catches what the typeahead
                  misses.
                </div>
              )}
            {!loading &&
              results.map((r, i) => (
                <button
                  key={r.id}
                  type="button"
                  // onMouseDown fires BEFORE the input blurs — picks
                  // up the choice without the dropdown closing first
                  // on tap. preventDefault keeps the input focused.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(r);
                  }}
                  // Mirror on touchstart for iOS — same reasoning.
                  onTouchStart={(e) => {
                    e.preventDefault();
                    pick(r);
                  }}
                  onMouseEnter={() => setHighlight(i)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "12px 14px",
                    minHeight: 48,
                    background: i === highlight ? MC.bg : "#fff",
                    border: "none",
                    borderBottom:
                      i < results.length - 1
                        ? `1px solid ${MC.line}`
                        : "none",
                    cursor: "pointer",
                    fontFamily: MC.font,
                    fontSize: 14,
                    color: MC.ink,
                    lineHeight: 1.4,
                  }}
                >
                  {r.displayName}
                </button>
              ))}
          </div>
        )}
    </div>
  );
}
