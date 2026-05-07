"use client";

import { useState } from "react";
import { AC } from "@/lib/tokens";

interface Props {
  tabs: readonly string[];
  active?: string;
  onChange?: (tab: string) => void;
  /**
   * Optional per-tab counts. When provided, each tab renders a small
   * pill next to its label showing the count. Tabs with 0 stay
   * visible but render the pill at low opacity so the manager can
   * tell at a glance which buckets have anything in them. Pass an
   * empty / partial map to skip pills on specific tabs.
   */
  counts?: Record<string, number>;
}

export function SegTabs({ tabs, active, onChange, counts }: Props) {
  const [internal, setInternal] = useState(active ?? tabs[0]);
  const current = active ?? internal;
  return (
    <div
      style={{
        display: "inline-flex",
        gap: 2,
        padding: 2,
        background: AC.bg,
        border: `1px solid ${AC.line}`,
        borderRadius: 8,
      }}
    >
      {tabs.map((t) => {
        const count = counts ? counts[t] : undefined;
        const isActive = t === current;
        return (
          <button
            key={t}
            type="button"
            onClick={() => {
              setInternal(t);
              onChange?.(t);
            }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "4px 10px",
              borderRadius: 6,
              background: isActive ? "#fff" : "transparent",
              color: isActive ? AC.ink : AC.mute,
              border: "none",
              cursor: "pointer",
              fontFamily: AC.font,
              fontSize: 11.5,
              fontWeight: 600,
              letterSpacing: -0.1,
              boxShadow: isActive ? "0 1px 2px rgba(0,0,0,0.04)" : "none",
            }}
          >
            <span>{t}</span>
            {typeof count === "number" && (
              <span
                style={{
                  fontFamily: AC.font,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: 0,
                  padding: "0 5px",
                  borderRadius: 99,
                  minWidth: 16,
                  textAlign: "center",
                  background: isActive
                    ? AC.bg
                    : count > 0
                    ? AC.brandSoft
                    : "transparent",
                  color:
                    count > 0 ? (isActive ? AC.brandDeep : AC.brandDeep) : AC.faint,
                  border: count === 0 ? `1px solid ${AC.line}` : "none",
                  lineHeight: 1.5,
                }}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
