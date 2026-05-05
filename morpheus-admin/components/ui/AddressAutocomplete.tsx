"use client";

import { useEffect, useRef, useState } from "react";
import { AC } from "@/lib/tokens";
import { inputStyle } from "./Filters";

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
  const lastQueryRef = useRef<string>("");

  useEffect(() => {
    const q = value.trim();
    if (q.length < MIN_QUERY) {
      setResults([]);
      setLoading(false);
      return;
    }
    if (q === lastQueryRef.current) return;

    const handle = setTimeout(async () => {
      lastQueryRef.current = q;
      setLoading(true);
      try {
        const res = await fetch(`/api/geocode/suggest?q=${encodeURIComponent(q)}`);
        if (!res.ok) {
          setResults([]);
          return;
        }
        const data = (await res.json()) as { results: Suggestion[] };
        setResults(data.results ?? []);
        setHighlight(-1);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(handle);
  }, [value]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
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

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <input
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
      />
      {open && (loading || results.length > 0 || value.trim().length >= MIN_QUERY) && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            marginTop: 4,
            background: "#fff",
            border: `1px solid ${AC.line}`,
            borderRadius: 8,
            boxShadow: "0 6px 16px rgba(0,0,0,0.10)",
            zIndex: 50,
            maxHeight: 280,
            overflowY: "auto",
          }}
        >
          {loading && (
            <div
              style={{
                padding: "10px 12px",
                fontFamily: AC.font,
                fontSize: 12,
                color: AC.mute,
              }}
            >
              Searching…
            </div>
          )}
          {!loading && results.length === 0 && value.trim().length >= MIN_QUERY && (
            <div
              style={{
                padding: "10px 12px",
                fontFamily: AC.font,
                fontSize: 12,
                color: AC.mute,
              }}
            >
              No matches
            </div>
          )}
          {!loading &&
            results.map((r, i) => (
              <button
                key={r.id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(r);
                }}
                onMouseEnter={() => setHighlight(i)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "9px 12px",
                  background: i === highlight ? AC.bg : "#fff",
                  border: "none",
                  borderBottom: i < results.length - 1 ? `1px solid ${AC.lineDim}` : "none",
                  cursor: "pointer",
                  fontFamily: AC.font,
                  fontSize: 12.5,
                  color: AC.ink,
                  lineHeight: 1.35,
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
