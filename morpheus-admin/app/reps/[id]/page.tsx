"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminShell } from "@/components/shell/AdminShell";
import { Btn } from "@/components/ui/Btn";
import { Card, SectionTitle } from "@/components/ui/Card";
import { AGlyph, type GlyphName } from "@/components/ui/AGlyph";
import { AC } from "@/lib/tokens";
import { supabase } from "@/lib/supabase";
import { type Profile, displayName } from "@/lib/profiles-store";
import { listShifts, shiftHref, type ShiftRow } from "@/lib/shifts-store";
import Link from "next/link";
import { listCustomers } from "@/lib/customers-store";
import {
  listCustomersForRep,
  setCustomersForRep,
} from "@/lib/assignments-store";
import { CustomFieldsCard } from "@/components/ui/CustomFieldsCard";
import type { Customer } from "@/lib/types";

function deriveInitials(name: string, email: string): string {
  const source = name?.trim() || email.split("@")[0];
  const words = source.split(/[\s._-]+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

function formatJoined(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

function formatTimeRange(start: string, end: string): string {
  const fmt = (t: string) => {
    if (!t) return "";
    const [hh, mm] = t.split(":");
    const h = parseInt(hh, 10);
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = ((h + 11) % 12) + 1;
    return `${h12}:${mm} ${ampm}`;
  };
  return `${fmt(start)} – ${fmt(end)}`;
}

export default function RepDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = use(params);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [allCustomers, setAllCustomers] = useState<Customer[]>([]);
  const [assignedCustomerIds, setAssignedCustomerIds] = useState<string[]>([]);
  const [savingAssignments, setSavingAssignments] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase) {
        setLoading(false);
        return;
      }
      const { data: profileData, error: profileErr } = await supabase
        .from("profiles")
        .select("id, email, name, role, created_at")
        .eq("id", id)
        .maybeSingle();
      if (cancelled) return;
      if (profileErr || !profileData) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setProfile(profileData as Profile);

      // Fetch all shifts; filter to this rep client-side. Cheap at small scale.
      const allShifts = await listShifts();
      if (cancelled) return;
      setShifts(allShifts.filter((s) => s.rep_id === id));

      // Customer roster + this rep's existing assignments.
      const [customers, assigned] = await Promise.all([
        listCustomers(),
        listCustomersForRep(id),
      ]);
      if (cancelled) return;
      setAllCustomers(customers);
      setAssignedCustomerIds(assigned);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <AdminShell breadcrumbs={["Home", "Reps", "…"]}>
        <div style={{ padding: 32, fontFamily: AC.font, fontSize: 13, color: AC.mute }}>
          Loading rep…
        </div>
      </AdminShell>
    );
  }

  if (notFound || !profile) {
    return (
      <AdminShell breadcrumbs={["Home", "Reps", "Not found"]}>
        <div style={{ padding: 32 }}>
          <Card padding={24}>
            <div style={{ fontFamily: AC.font, fontSize: 14, color: AC.ink, marginBottom: 8 }}>
              No rep found with this ID.
            </div>
            <div style={{ fontFamily: AC.font, fontSize: 12, color: AC.mute, marginBottom: 16 }}>
              They may have been deleted, or the link is from an older version of the app.
            </div>
            <Btn onClick={() => router.push("/reps")}>Back to Reps</Btn>
          </Card>
        </div>
      </AdminShell>
    );
  }

  const name = displayName(profile);
  const initials = deriveInitials(profile.name || "", profile.email);
  const todayShifts = shifts.filter((s) => {
    const today = new Date().toISOString().slice(0, 10);
    return s.shift_date === today;
  });
  const completed = shifts.filter((s) => s.state === "complete").length;
  const inProgress = shifts.filter((s) => s.state === "in-progress").length;

  return (
    <AdminShell
      breadcrumbs={["Home", "Reps", name]}
      actions={
        <Btn
          icon="edit"
          kind="primary"
          size="sm"
          onClick={() => router.push(`/settings/managers/${id}/edit`)}
        >
          Edit
        </Btn>
      }
    >
      <div
        style={{
          padding: 20,
          display: "grid",
          gridTemplateColumns: "320px 1fr",
          gap: 16,
          alignItems: "start",
        }}
      >
        {/* Left: profile card */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Card padding={20}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 99,
                  background: AC.brand,
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: AC.font,
                  fontSize: 20,
                  fontWeight: 700,
                  letterSpacing: 0.5,
                }}
              >
                {initials}
              </div>
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: AC.font,
                    fontSize: 17,
                    fontWeight: 700,
                    color: AC.ink,
                    letterSpacing: -0.3,
                  }}
                >
                  {name}
                </div>
                <div style={{ fontFamily: AC.font, fontSize: 12, color: AC.mute, marginTop: 2 }}>
                  {profile.role === "manager" ? "Manager" : "Field Rep"}
                </div>
                <div style={{ marginTop: 6 }}>
                  <span
                    style={{
                      padding: "3px 9px",
                      borderRadius: 99,
                      background: AC.okTint,
                      color: "#0F5A38",
                      fontFamily: AC.font,
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  >
                    ● Active
                  </span>
                </div>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 10,
                paddingTop: 14,
                borderTop: `1px solid ${AC.line}`,
              }}
            >
              <DetailRow icon="mail" label="Email" value={profile.email} />
              <DetailRow icon="cal" label="Joined" value={formatJoined(profile.created_at)} />
              <DetailRow
                icon="info"
                label="Role"
                value={profile.role.charAt(0).toUpperCase() + profile.role.slice(1)}
              />
            </div>
          </Card>
          <CustomFieldsCard entity="rep" entityId={profile.id} />
        </div>

        {/* Right: shifts list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Card padding={0}>
            <div style={{ padding: 16 }}>
              <SectionTitle>Today’s shifts</SectionTitle>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: 12,
                  marginBottom: 18,
                }}
              >
                <MiniStat label="Today" value={`${todayShifts.length}`} tone="ok" />
                <MiniStat label="In progress" value={`${inProgress}`} tone="ok" />
                <MiniStat label="Completed" value={`${completed}`} tone="neutral" />
              </div>

              {todayShifts.length === 0 ? (
                <div
                  style={{
                    padding: 20,
                    background: AC.bg,
                    borderRadius: 10,
                    fontFamily: AC.font,
                    fontSize: 13,
                    color: AC.mute,
                    textAlign: "center",
                  }}
                >
                  No shifts assigned to this rep today.
                </div>
              ) : (
                <div
                  style={{
                    border: `1px solid ${AC.line}`,
                    borderRadius: 10,
                    overflow: "hidden",
                  }}
                >
                  {todayShifts.map((s, i) => (
                    <Link
                      key={s.id}
                      href={shiftHref(s)}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 140px 110px",
                        gap: 12,
                        alignItems: "center",
                        padding: "10px 14px",
                        borderBottom:
                          i < todayShifts.length - 1 ? `1px solid ${AC.lineDim}` : "none",
                        background: "#fff",
                        textDecoration: "none",
                        color: "inherit",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        {s.customers && (
                          <div
                            style={{
                              width: 22,
                              height: 22,
                              borderRadius: 5,
                              background: s.customers.color,
                              color: "#fff",
                              fontFamily: AC.font,
                              fontSize: 9,
                              fontWeight: 700,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            {s.customers.initials}
                          </div>
                        )}
                        <div
                          style={{
                            fontFamily: AC.font,
                            fontSize: 12.5,
                            color: AC.ink,
                            fontWeight: 600,
                          }}
                        >
                          {s.customers?.name || s.customer_id}
                        </div>
                      </div>
                      <div
                        style={{
                          fontFamily: AC.font,
                          fontSize: 12,
                          color: AC.ink2,
                          fontWeight: 600,
                        }}
                      >
                        {formatTimeRange(s.start_time, s.end_time)}
                      </div>
                      <div
                        style={{
                          fontFamily: AC.font,
                          fontSize: 11,
                          fontWeight: 600,
                          color:
                            s.state === "complete"
                              ? AC.ok
                              : s.state === "in-progress"
                              ? AC.brandDeep
                              : AC.mute,
                          textTransform: "capitalize",
                        }}
                      >
                        {s.state.replace("-", " ")}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </Card>

          {/* Assigned customers editor */}
          <Card padding={0}>
            <div
              style={{
                padding: "14px 16px",
                borderBottom: `1px solid ${AC.line}`,
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <SectionTitle>Assigned customers</SectionTitle>
              <span
                style={{
                  padding: "2px 7px",
                  borderRadius: 99,
                  background: AC.bg,
                  color: AC.mute,
                  fontFamily: AC.font,
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                {assignedCustomerIds.length}
              </span>
              <div style={{ flex: 1 }} />
              {savingAssignments && (
                <span style={{ fontFamily: AC.font, fontSize: 11, color: AC.mute }}>
                  Saving…
                </span>
              )}
            </div>
            <div style={{ padding: 16 }}>
              {assignError && (
                <div
                  style={{
                    marginBottom: 10,
                    padding: "8px 10px",
                    background: AC.dangerTint,
                    color: "#9c1a3c",
                    borderRadius: 8,
                    fontFamily: AC.font,
                    fontSize: 12,
                  }}
                >
                  {assignError}
                </div>
              )}
              {allCustomers.length === 0 ? (
                <div
                  style={{
                    padding: 18,
                    background: AC.bg,
                    borderRadius: 10,
                    fontFamily: AC.font,
                    fontSize: 13,
                    color: AC.mute,
                    textAlign: "center",
                  }}
                >
                  No customers yet. Add one first via the Customers page.
                </div>
              ) : (
                <CustomerMultiSelect
                  customers={allCustomers}
                  selectedIds={assignedCustomerIds}
                  onChange={async (next) => {
                    setSavingAssignments(true);
                    setAssignError(null);
                    const r = await setCustomersForRep(id, next);
                    setSavingAssignments(false);
                    if (!r.ok) {
                      setAssignError(r.error || "Failed to update assignments.");
                      return;
                    }
                    setAssignedCustomerIds(next);
                  }}
                />
              )}
            </div>
          </Card>

          {/* All shifts (excluding today, capped) */}
          {shifts.length > todayShifts.length && (
            <Card padding={16}>
              <SectionTitle>Other shifts (recent)</SectionTitle>
              <div style={{ fontFamily: AC.font, fontSize: 12, color: AC.mute }}>
                {shifts.length - todayShifts.length} other shift
                {shifts.length - todayShifts.length === 1 ? "" : "s"} on file.
              </div>
            </Card>
          )}
        </div>
      </div>
    </AdminShell>
  );
}

function DetailRow({ icon, label, value }: { icon: GlyphName; label: string; value: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div
        style={{
          width: 24,
          height: 24,
          borderRadius: 6,
          background: AC.bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <AGlyph name={icon} size={12} color={AC.mute} />
      </div>
      <div
        style={{
          fontFamily: AC.font,
          fontSize: 11,
          color: AC.mute,
          fontWeight: 600,
          width: 60,
        }}
      >
        {label}
      </div>
      <div
        style={{
          flex: 1,
          fontFamily: AC.font,
          fontSize: 12.5,
          color: AC.ink,
          fontWeight: 500,
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "ok" | "warn" | "neutral";
}) {
  const tc = { ok: AC.ok, warn: AC.warn, neutral: AC.mute }[tone];
  return (
    <div
      style={{
        padding: 12,
        borderRadius: 10,
        background: AC.bg,
        border: `1px solid ${AC.line}`,
      }}
    >
      <div
        style={{
          fontFamily: AC.font,
          fontSize: 11,
          color: AC.mute,
          fontWeight: 600,
          letterSpacing: 0.2,
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: AC.font,
          fontSize: 22,
          fontWeight: 700,
          color: AC.ink,
          letterSpacing: -0.6,
          marginTop: 4,
        }}
      >
        {value}
      </div>
      <div style={{ fontFamily: AC.font, fontSize: 11, color: tc, fontWeight: 600, marginTop: 2 }}>
        &nbsp;
      </div>
    </div>
  );
}

function CustomerMultiSelect({
  customers,
  selectedIds,
  onChange,
}: {
  customers: Customer[];
  selectedIds: string[];
  onChange: (next: string[]) => void | Promise<void>;
}) {
  const set = new Set(selectedIds);
  const toggle = (cid: string) => {
    const next = new Set(set);
    if (next.has(cid)) next.delete(cid);
    else next.add(cid);
    onChange(Array.from(next));
  };
  const linkBtn: React.CSSProperties = {
    background: "transparent",
    border: "none",
    cursor: "pointer",
    fontFamily: AC.font,
    fontSize: 11,
    color: AC.brandDeep,
    fontWeight: 600,
    padding: "2px 4px",
  };
  return (
    <div
      style={{
        border: `1px solid ${AC.line}`,
        borderRadius: 10,
        background: "#fff",
        maxHeight: 320,
        overflowY: "auto",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          borderBottom: `1px solid ${AC.lineDim}`,
          background: AC.bg,
        }}
      >
        <span
          style={{ fontFamily: AC.font, fontSize: 11, color: AC.mute, fontWeight: 600 }}
        >
          {selectedIds.length} of {customers.length} selected
        </span>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={() => onChange(customers.map((c) => c.id))}
          style={linkBtn}
        >
          Select all
        </button>
        <span style={{ color: AC.faint }}>·</span>
        <button type="button" onClick={() => onChange([])} style={linkBtn}>
          Clear
        </button>
      </div>
      {customers.map((c) => {
        const checked = set.has(c.id);
        return (
          <label
            key={c.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "9px 12px",
              borderBottom: `1px solid ${AC.lineDim}`,
              cursor: "pointer",
              background: checked ? AC.brandSoft : "#fff",
            }}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() => toggle(c.id)}
              style={{ width: 16, height: 16, accentColor: AC.brand }}
            />
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: 5,
                background: c.color,
                color: "#fff",
                fontFamily: AC.font,
                fontSize: 9,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {c.initials}
            </div>
            <div
              style={{
                flex: 1,
                minWidth: 0,
                fontFamily: AC.font,
                fontSize: 13,
                color: AC.ink,
                fontWeight: 500,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {c.name}
            </div>
            <span style={{ fontFamily: AC.font, fontSize: 11.5, color: AC.mute }}>
              #{c.code}
            </span>
          </label>
        );
      })}
    </div>
  );
}
