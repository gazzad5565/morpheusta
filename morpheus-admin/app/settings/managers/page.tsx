"use client";

/**
 * /settings/managers — list every user + flip each one between rep
 * and manager.
 *
 * Managers can sign in to the admin console (this app); reps can't.
 * The cross-app gate is enforced by AuthGate reading profiles.role.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminShell } from "@/components/shell/AdminShell";
import { Btn } from "@/components/ui/Btn";
import { Card, SectionTitle } from "@/components/ui/Card";
import { AGlyph } from "@/components/ui/AGlyph";
import { AC } from "@/lib/tokens";
import { getUser } from "@/lib/auth";
import {
  listProfiles,
  setProfileRole,
  displayName,
  type Profile,
} from "@/lib/profiles-store";

function deriveInitials(p: Profile): string {
  const src = p.name?.trim() || p.email.split("@")[0] || "?";
  const parts = src.split(/\s+|[._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return parts[0]?.slice(0, 2).toUpperCase() || "??";
}

function formatJoined(iso: string | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function ManagersPage() {
  const router = useRouter();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [myId, setMyId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "manager" | "rep">("all");

  const reload = () => {
    listProfiles().then((rows) => {
      setProfiles(rows);
      setLoaded(true);
    });
  };

  useEffect(() => {
    reload();
    getUser().then((u) => setMyId(u?.id ?? null));
  }, []);

  const counts = useMemo(() => {
    return {
      managers: profiles.filter((p) => p.role === "manager").length,
      reps: profiles.filter((p) => p.role === "rep").length,
    };
  }, [profiles]);

  const filtered = useMemo(() => {
    if (filter === "all") return profiles;
    return profiles.filter((p) => p.role === filter);
  }, [profiles, filter]);

  const onToggle = async (p: Profile) => {
    if (busyId) return;
    setError(null);
    const next = p.role === "manager" ? "rep" : "manager";
    // Block accidental self-demotion (you'd lock yourself out of the admin console).
    if (next === "rep" && myId === p.id) {
      const confirmed = confirm(
        `You're about to remove your OWN manager access. You'll be locked out of the admin console next reload. Continue?`
      );
      if (!confirmed) return;
    } else if (
      !confirm(
        next === "manager"
          ? `Promote ${displayName(p)} to manager?\n\nThey'll be able to sign in to the admin console.`
          : `Demote ${displayName(p)} to rep?\n\nThey'll lose admin console access on their next reload.`
      )
    ) {
      return;
    }
    setBusyId(p.id);
    const r = await setProfileRole(p.id, next);
    setBusyId(null);
    if (!r.ok) {
      setError(r.error || "Couldn't update role.");
      return;
    }
    setProfiles((arr) => arr.map((x) => (x.id === p.id ? { ...x, role: next } : x)));
  };

  return (
    <AdminShell
      breadcrumbs={["Home", "Settings", "Managers"]}
      actions={
        <Btn size="sm" onClick={() => router.push("/settings")}>
          Back to settings
        </Btn>
      }
    >
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
        <Card padding={20}>
          <SectionTitle>Managers vs reps</SectionTitle>
          <div
            style={{
              fontFamily: AC.font,
              fontSize: 12.5,
              color: AC.mute,
              marginTop: 4,
              lineHeight: 1.55,
            }}
          >
            <b style={{ color: AC.ink }}>Managers</b> can sign in here (the admin console)
            and edit customers, schedule shifts, manage tasks, etc. <b style={{ color: AC.ink }}>Reps</b>{" "}
            sign in to the mobile app. New signups land as reps by default — promote anyone
            who needs admin access. To add a new manager, have them sign up at the admin URL
            (it auto-assigns manager) or sign up here as a rep first and promote them below.
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
            <StatChip label="Managers" value={counts.managers} tone={AC.brandDeep} />
            <StatChip label="Reps" value={counts.reps} tone={AC.ink2} />
            <StatChip label="Total users" value={profiles.length} tone={AC.mute} />
          </div>
        </Card>

        <Card padding={0}>
          <div
            style={{
              padding: "12px 16px",
              borderBottom: `1px solid ${AC.line}`,
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <SectionTitle>Users</SectionTitle>
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
              {filtered.length}
            </span>
            <div style={{ flex: 1 }} />
            <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
              All
            </FilterChip>
            <FilterChip active={filter === "manager"} onClick={() => setFilter("manager")}>
              Managers
            </FilterChip>
            <FilterChip active={filter === "rep"} onClick={() => setFilter("rep")}>
              Reps
            </FilterChip>
          </div>

          {error && (
            <div
              style={{
                margin: "12px 16px 0",
                padding: "10px 12px",
                background: AC.dangerTint,
                color: "#9c1a3c",
                borderRadius: 10,
                fontFamily: AC.font,
                fontSize: 13,
              }}
            >
              {error}
            </div>
          )}

          {!loaded ? (
            <div
              style={{
                padding: 28,
                textAlign: "center",
                fontFamily: AC.font,
                fontSize: 13,
                color: AC.mute,
              }}
            >
              Loading users…
            </div>
          ) : filtered.length === 0 ? (
            <div
              style={{
                padding: 28,
                textAlign: "center",
                fontFamily: AC.font,
                fontSize: 13,
                color: AC.mute,
              }}
            >
              No users yet.
            </div>
          ) : (
            filtered.map((p, i) => (
              <div
                key={p.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.6fr 1.4fr 110px 110px 110px",
                  gap: 14,
                  alignItems: "center",
                  padding: "12px 16px",
                  borderBottom: i < filtered.length - 1 ? `1px solid ${AC.lineDim}` : "none",
                  background: "#fff",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  <div
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 99,
                      background: p.role === "manager" ? AC.brand : AC.brandDeep,
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
                    {deriveInitials(p)}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontFamily: AC.font,
                        fontSize: 13,
                        fontWeight: 600,
                        color: AC.ink,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {displayName(p)}
                      {myId === p.id && (
                        <span
                          style={{
                            marginLeft: 6,
                            padding: "1px 6px",
                            borderRadius: 99,
                            background: AC.bg,
                            color: AC.mute,
                            fontSize: 10,
                            fontWeight: 700,
                            letterSpacing: 0.3,
                            textTransform: "uppercase",
                          }}
                        >
                          you
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        fontFamily: AC.font,
                        fontSize: 11,
                        color: AC.mute,
                        marginTop: 1,
                      }}
                    >
                      {p.email}
                    </div>
                  </div>
                </div>
                <div
                  style={{
                    fontFamily: AC.font,
                    fontSize: 12,
                    color: AC.mute,
                    fontWeight: 500,
                  }}
                >
                  Joined {formatJoined(p.created_at)}
                </div>
                <div>
                  <span
                    style={{
                      padding: "3px 9px",
                      borderRadius: 99,
                      background: p.role === "manager" ? AC.brandSoft : AC.bg,
                      color: p.role === "manager" ? AC.brandInk : AC.ink2,
                      fontFamily: AC.font,
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: 0.3,
                      textTransform: "uppercase",
                    }}
                  >
                    {p.role === "manager" ? "Manager" : "Rep"}
                  </span>
                </div>
                <div
                  style={{
                    fontFamily: AC.font,
                    fontSize: 11.5,
                    color: AC.mute,
                  }}
                >
                  {p.role === "manager" ? "Admin access" : "Mobile only"}
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <Btn
                    size="sm"
                    kind={p.role === "manager" ? "secondary" : "primary"}
                    onClick={() => onToggle(p)}
                    disabled={busyId === p.id}
                  >
                    {busyId === p.id
                      ? "…"
                      : p.role === "manager"
                      ? "Demote"
                      : "Promote"}
                  </Btn>
                </div>
              </div>
            ))
          )}
        </Card>

        <div
          style={{
            fontFamily: AC.font,
            fontSize: 11,
            color: AC.mute,
            textAlign: "center",
          }}
        >
          Promotions take effect on the user's next page reload. Demoting yourself is
          allowed but you'll lose admin access immediately.
        </div>
      </div>
    </AdminShell>
  );
}

function StatChip({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div
      style={{
        padding: "10px 14px",
        background: AC.bg,
        borderRadius: 10,
        border: `1px solid ${AC.line}`,
        minWidth: 110,
      }}
    >
      <div
        style={{
          fontFamily: AC.font,
          fontSize: 10.5,
          color: AC.mute,
          fontWeight: 600,
          letterSpacing: 0.3,
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: AC.font,
          fontSize: 20,
          fontWeight: 700,
          color: tone,
          letterSpacing: -0.4,
          marginTop: 2,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "5px 12px",
        borderRadius: 99,
        background: active ? AC.ink : "#fff",
        color: active ? "#fff" : AC.ink2,
        border: `1px solid ${active ? AC.ink : AC.line}`,
        fontFamily: AC.font,
        fontSize: 11.5,
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}
