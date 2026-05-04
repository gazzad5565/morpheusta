"use client";

import { useState } from "react";
import { AC } from "@/lib/tokens";

interface Props {
  tabs: readonly string[];
  active?: string;
  onChange?: (tab: string) => void;
}

export function SegTabs({ tabs, active, onChange }: Props) {
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
      {tabs.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => {
            setInternal(t);
            onChange?.(t);
          }}
          style={{
            padding: "4px 10px",
            borderRadius: 6,
            background: t === current ? "#fff" : "transparent",
            color: t === current ? AC.ink : AC.mute,
            border: "none",
            cursor: "pointer",
            fontFamily: AC.font,
            fontSize: 11.5,
            fontWeight: 600,
            letterSpacing: -0.1,
            boxShadow: t === current ? "0 1px 2px rgba(0,0,0,0.04)" : "none",
          }}
        >
          {t}
        </button>
      ))}
    </div>
  );
}
