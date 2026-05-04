"use client";

import Link from "next/link";
import { AdminShell } from "@/components/shell/AdminShell";
import { Btn } from "@/components/ui/Btn";
import { Card } from "@/components/ui/Card";
import { AGlyph } from "@/components/ui/AGlyph";
import { RepAvatar } from "@/components/ui/Avatars";
import { StatusPill } from "@/components/ui/StatusPill";
import { AC } from "@/lib/tokens";
import { REPS } from "@/lib/mock-data";
import type { Rep } from "@/lib/types";
import type { CSSProperties } from "react";

export default function RepsPage() {
  const reps = REPS;
  return (
    <AdminShell
      title="Reps"
      breadcrumbs={["Home", "Reps"]}
      actions={
        <div style={{ display: "flex", gap: 8 }}>
          <Btn icon="upload" size="sm">Import CSV</Btn>
          <Btn icon="plus" kind="primary" size="sm">Add rep</Btn>
        </div>
      }
    >
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
        <Card padding={12}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <FilterChip active>
              All <span style={{ color: AC.mute, fontWeight: 500 }}>· {reps.length}</span>
            </FilterChip>
            <FilterChip>On shift now · 8</FilterChip>
            <FilterChip>Late this week · 5</FilterChip>
            <FilterChip>Off-site flag · 2</FilterChip>
            <FilterChip>Onboarding · 3</FilterChip>
            <div style={{ flex: 1 }} />
            <FilterDropdown label="Region" value="All" />
            <FilterDropdown label="Status" value="Any" />
            <FilterDropdown label="Tenure" value="All" />
          </div>
        </Card>

        <Card padding={0}>
          <div style={repsHeader()}>
            <div style={{ paddingLeft: 4 }}>
              <input type="checkbox" style={CB} readOnly />
            </div>
            <div>Rep</div>
            <div>Region</div>
            <div>Status</div>
            <div>Current</div>
            <div>Shifts (90d)</div>
            <div>On-time</div>
            <div>Completion</div>
            <div></div>
          </div>
          {reps.map((rep, i) => (
            <RepRow key={rep.id} rep={rep} highlight={i === 0} />
          ))}
          <div
            style={{
              padding: "12px 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              borderTop: `1px solid ${AC.line}`,
            }}
          >
            <div style={{ fontFamily: AC.font, fontSize: 12, color: AC.mute }}>
              Showing 1–{reps.length} of 87 reps
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              <PageBtn>‹</PageBtn>
              <PageBtn active>1</PageBtn>
              <PageBtn>2</PageBtn>
              <PageBtn>3</PageBtn>
              <PageBtn>…</PageBtn>
              <PageBtn>8</PageBtn>
              <PageBtn>›</PageBtn>
            </div>
          </div>
        </Card>
      </div>
    </AdminShell>
  );
}

const CB: CSSProperties = { width: 14, height: 14, accentColor: AC.brand };

function repsHeader(): CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: "36px 1.6fr 90px 130px 1.4fr 110px 110px 130px 36px",
    alignItems: "center",
    gap: 14,
    padding: "10px 16px",
    background: AC.bg,
    borderBottom: `1px solid ${AC.line}`,
    fontFamily: AC.font,
    fontSize: 11,
    fontWeight: 600,
    color: AC.mute,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  };
}

function RepRow({ rep, highlight }: { rep: Rep; highlight?: boolean }) {
  const onShift = rep.status !== "offline";
  const onTime = `${100 - Math.round((rep.late * 100) / Math.max(rep.shifts, 1) * 10)}%`;
  return (
    <Link
      href={`/reps/${rep.id}`}
      style={{
        display: "grid",
        gridTemplateColumns: "36px 1.6fr 90px 130px 1.4fr 110px 110px 130px 36px",
        alignItems: "center",
        gap: 14,
        padding: "12px 16px",
        borderBottom: `1px solid ${AC.lineDim}`,
        background: highlight ? AC.brandSoft : "#fff",
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <div style={{ paddingLeft: 4 }} onClick={(e) => e.preventDefault()}>
        <input type="checkbox" style={CB} readOnly />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <RepAvatar rep={rep} size={32} />
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontFamily: AC.font,
              fontSize: 13,
              fontWeight: 600,
              color: AC.ink,
              letterSpacing: -0.1,
            }}
          >
            {rep.name}
          </div>
          <div style={{ fontFamily: AC.font, fontSize: 11.5, color: AC.mute, marginTop: 1 }}>
            {rep.email}
          </div>
        </div>
      </div>
      <div style={{ fontFamily: AC.font, fontSize: 12.5, color: AC.ink2, fontWeight: 500 }}>
        {rep.region}
      </div>
      <div>
        <StatusPill status={rep.status} />
      </div>
      <div style={{ minWidth: 0 }}>
        {onShift ? (
          <div>
            <div
              style={{
                fontFamily: AC.font,
                fontSize: 12.5,
                color: AC.ink,
                fontWeight: 600,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {rep.shiftCustomer}
            </div>
            <div style={{ fontFamily: AC.font, fontSize: 11, color: AC.mute, marginTop: 1 }}>
              since {rep.since}
            </div>
          </div>
        ) : (
          <div style={{ fontFamily: AC.font, fontSize: 12, color: AC.faint, fontWeight: 500 }}>
            Off the clock
          </div>
        )}
      </div>
      <div style={{ fontFamily: AC.font, fontSize: 13, color: AC.ink, fontWeight: 600 }}>
        {rep.shifts}
      </div>
      <div
        style={{
          fontFamily: AC.font,
          fontSize: 13,
          fontWeight: 700,
          color: rep.late > 10 ? AC.danger : AC.ok,
        }}
      >
        {onTime}
      </div>
      <CompletionBar value={rep.completion} />
      <button
        type="button"
        onClick={(e) => e.preventDefault()}
        style={{
          width: 26,
          height: 26,
          background: "transparent",
          border: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <AGlyph name="more" size={16} color={AC.mute} />
      </button>
    </Link>
  );
}

function FilterChip({ children, active }: { children: React.ReactNode; active?: boolean }) {
  return (
    <button
      type="button"
      style={{
        padding: "6px 12px",
        borderRadius: 99,
        background: active ? AC.ink : "#fff",
        color: active ? "#fff" : AC.ink2,
        border: `1px solid ${active ? AC.ink : AC.line}`,
        fontFamily: AC.font,
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: -0.1,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function FilterDropdown({ label, value }: { label: string; value: string }) {
  return (
    <button
      type="button"
      style={{
        padding: "6px 11px",
        borderRadius: 8,
        background: "#fff",
        border: `1px solid ${AC.line}`,
        color: AC.ink2,
        fontFamily: AC.font,
        fontSize: 12,
        fontWeight: 600,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        cursor: "pointer",
      }}
    >
      <span style={{ color: AC.mute, fontWeight: 500 }}>{label}:</span> {value}
      <AGlyph name="chev-d" size={11} color={AC.mute} />
    </button>
  );
}

function CompletionBar({ value }: { value: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div
        style={{
          flex: 1,
          height: 5,
          borderRadius: 99,
          background: AC.bgDeep,
          overflow: "hidden",
          maxWidth: 80,
        }}
      >
        <div
          style={{
            width: `${value}%`,
            height: "100%",
            background: value >= 95 ? AC.ok : value >= 85 ? AC.brand : AC.warn,
            borderRadius: 99,
          }}
        />
      </div>
      <div
        style={{
          fontFamily: AC.fontMono,
          fontSize: 11.5,
          color: AC.ink2,
          fontWeight: 600,
          minWidth: 30,
        }}
      >
        {value}%
      </div>
    </div>
  );
}

function PageBtn({ children, active }: { children: React.ReactNode; active?: boolean }) {
  return (
    <button
      type="button"
      style={{
        minWidth: 28,
        height: 28,
        padding: "0 8px",
        borderRadius: 6,
        background: active ? AC.ink : "transparent",
        color: active ? "#fff" : AC.ink2,
        border: active ? "1px solid transparent" : `1px solid ${AC.line}`,
        fontFamily: AC.font,
        fontSize: 12,
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}
