"use client";

/**
 * /settings/managers — list every user + flip each one between rep
 * and manager.
 *
 * Managers can sign in to the admin console (this app); reps can't.
 * The cross-app gate is enforced by AuthGate reading profiles.role.
 */

import { useEffect, useMemo, useState } from "react";
import { Pagination, DEFAULT_PAGE_SIZE } from "@/components/ui/Pagination";
import { useColumnWidths } from "@/lib/use-column-widths";
import { ColumnResizer } from "@/components/ui/ColumnResizer";

// Default column widths for /settings/managers. localStorage takes
// over once the user resizes (key `morpheus.cols.settings-managers.v1`).
const USERS_COLUMNS = [280, 200, 110, 130, 110] as const;
import Link from "next/link";
import { SettingsShell } from "@/components/shell/SettingsShell";
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
import { createUser, deleteUser, randomPassword } from "@/lib/users-admin";
import { initialsFromNameOrEmail } from "@/lib/format";
import { getRepTypes, type RepTypeConfig } from "@/lib/settings-store";
import { ManageRepTypesSheet } from "@/components/users/ManageRepTypesSheet";

const deriveInitials = (p: Profile) => initialsFromNameOrEmail(p.name, p.email);

function formatJoined(iso: string | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function ManagersPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [myId, setMyId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "manager" | "rep">("all");
  const [page, setPage] = useState(0);
  // Resizable columns — widths persisted per-browser via localStorage.
  const cols = useColumnWidths("settings-managers", USERS_COLUMNS);

  // Add-user modal
  const [addOpen, setAddOpen] = useState(false);
  // Manage-rep-types modal + the live vocabulary so we can offer
  // type assignments inline + so it's available to pass into the
  // edit page once that wiring lands.
  const [repTypesOpen, setRepTypesOpen] = useState(false);
  const [repTypes, setRepTypesState] = useState<RepTypeConfig[]>([]);

  useEffect(() => {
    getRepTypes().then(setRepTypesState);
  }, []);

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

  // Reset to page 0 whenever the filter changes — without this the
  // user could land on an empty page after narrowing results.
  useEffect(() => {
    setPage(0);
  }, [filter]);

  // Slice the filtered array down to the current page's window.
  const pageItems = filtered.slice(
    page * DEFAULT_PAGE_SIZE,
    (page + 1) * DEFAULT_PAGE_SIZE
  );

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
    <SettingsShell
      section="managers"
      actions={
        <div style={{ display: "flex", gap: 8 }}>
          <Btn size="sm" icon="settings" onClick={() => setRepTypesOpen(true)}>
            Manage rep types
          </Btn>
          <Link href="/settings/import" style={{ textDecoration: "none" }}>
            <Btn icon="upload" size="sm">
              Import
            </Btn>
          </Link>
          <Btn
            size="sm"
            kind="primary"
            icon="plus"
            onClick={() => setAddOpen(true)}
          >
            Add user
          </Btn>
        </div>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
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

        <Card padding={0} style={{ overflowX: "auto" }}>
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

          {/* Column-header row — added for resizable-column UX. Mirrors
              the header pattern on /tasks, /library, /reps, /customers
              so all 5 paginated list pages now have consistent column
              labels + draggable dividers. */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: cols.gridTemplateColumns,
              gap: 14,
              padding: "10px 16px",
              background: AC.bg,
              borderBottom: `1px solid ${AC.line}`,
              fontFamily: AC.font,
              fontSize: 11,
              color: AC.mute,
              fontWeight: 600,
              letterSpacing: 0.3,
              textTransform: "uppercase",
            }}
          >
            <div style={{ position: "relative" }}>User<ColumnResizer index={0} cols={cols} /></div>
            <div style={{ position: "relative" }}>Joined<ColumnResizer index={1} cols={cols} /></div>
            <div style={{ position: "relative" }}>Role<ColumnResizer index={2} cols={cols} /></div>
            <div style={{ position: "relative" }}>Access<ColumnResizer index={3} cols={cols} /></div>
            <div></div>
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
            pageItems.map((p, i) => (
              <div
                key={p.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: cols.gridTemplateColumns,
                  gap: 14,
                  alignItems: "center",
                  padding: "12px 16px",
                  borderBottom: i < pageItems.length - 1 ? `1px solid ${AC.lineDim}` : "none",
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
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
                  <Link
                    href={`/settings/managers/${p.id}/edit`}
                    title="Edit user"
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      border: `1px solid ${AC.line}`,
                      background: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      textDecoration: "none",
                    }}
                  >
                    <AGlyph name="edit" size={14} color={AC.ink2} />
                  </Link>
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

        <Pagination
          totalItems={filtered.length}
          currentPage={page}
          onPageChange={setPage}
        />

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

      {addOpen && (
        <AddUserModal
          onClose={() => setAddOpen(false)}
          onCreated={() => {
            setAddOpen(false);
            reload();
          }}
        />
      )}

      {repTypesOpen && (
        <ManageRepTypesSheet
          current={repTypes}
          onClose={() => setRepTypesOpen(false)}
          onSaved={(next) => {
            setRepTypesState(next);
            setRepTypesOpen(false);
          }}
        />
      )}
    </SettingsShell>
  );
}

// ─── Add user modal ────────────────────────────────────────────────────

function AddUserModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"manager" | "rep">("manager");
  const [password, setPassword] = useState(() => randomPassword(12));
  const [showPass, setShowPass] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState(false);

  const onSubmit = async () => {
    if (busy) return;
    setError(null);
    if (!name.trim()) return setError("Name is required.");
    if (!email.trim()) return setError("Email is required.");
    if (password.length < 6) return setError("Password must be ≥ 6 chars.");
    setBusy(true);
    const r = await createUser({
      email: email.trim(),
      password,
      name: name.trim(),
      role,
    });
    setBusy(false);
    if (!r.ok) {
      setError(r.error || "Couldn't create user.");
      return;
    }
    setCreated(true);
  };

  const copyPassword = async () => {
    try {
      await navigator.clipboard.writeText(password);
    } catch {
      /* no-op */
    }
  };
  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(
        `Email: ${email}\nPassword: ${password}\nLogin: https://morpheus-admin.vercel.app/login`
      );
    } catch {
      /* no-op */
    }
  };

  return (
    <div
      role="dialog"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        background: "rgba(10,15,30,.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 14,
          width: "100%",
          maxWidth: 480,
          boxShadow: "0 20px 60px rgba(10,15,30,.25)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "16px 20px",
            borderBottom: `1px solid ${AC.line}`,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <div
            style={{
              fontFamily: AC.font,
              fontSize: 15,
              fontWeight: 700,
              color: AC.ink,
              letterSpacing: -0.2,
            }}
          >
            {created ? "User created" : "Add user"}
          </div>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              background: "transparent",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <AGlyph name="x" size={14} color={AC.mute} />
          </button>
        </div>
        <div style={{ padding: 20 }}>
          {!created ? (
            <>
              <ModalField label="Full name" required>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Sarah Mokoena"
                  style={modalInputStyle}
                />
              </ModalField>
              <ModalField label="Email" required>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="sarah@yourcompany.com"
                  style={modalInputStyle}
                />
              </ModalField>
              <ModalField label="Role" required>
                <div style={{ display: "flex", gap: 8 }}>
                  <RoleButton
                    active={role === "manager"}
                    onClick={() => setRole("manager")}
                    title="Manager"
                    sub="Admin console access"
                  />
                  <RoleButton
                    active={role === "rep"}
                    onClick={() => setRole("rep")}
                    title="Rep"
                    sub="Mobile app only"
                  />
                </div>
              </ModalField>
              <ModalField
                label="Initial password"
                hint="You'll share this with the user. They can change it themselves later."
              >
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    type={showPass ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    style={{ ...modalInputStyle, fontFamily: AC.fontMono, flex: 1 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((s) => !s)}
                    title={showPass ? "Hide" : "Show"}
                    style={iconBtnStyle}
                  >
                    <AGlyph name="eye" size={14} color={AC.mute} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPassword(randomPassword(12))}
                    title="Regenerate"
                    style={iconBtnStyle}
                  >
                    <AGlyph name="refresh" size={14} color={AC.mute} />
                  </button>
                  <button
                    type="button"
                    onClick={copyPassword}
                    title="Copy"
                    style={iconBtnStyle}
                  >
                    <AGlyph name="check" size={14} color={AC.mute} />
                  </button>
                </div>
              </ModalField>

              {error && (
                <div
                  style={{
                    padding: "9px 11px",
                    background: AC.dangerTint,
                    color: "#9c1a3c",
                    borderRadius: 8,
                    fontFamily: AC.font,
                    fontSize: 12.5,
                    fontWeight: 500,
                    marginBottom: 12,
                  }}
                >
                  {error}
                </div>
              )}

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <Btn onClick={onClose} disabled={busy}>
                  Cancel
                </Btn>
                <Btn kind="primary" icon="check" onClick={onSubmit} disabled={busy}>
                  {busy ? "Creating…" : "Create user"}
                </Btn>
              </div>
            </>
          ) : (
            // ─── Success: show credentials once ──────────────────────
            <div>
              <div
                style={{
                  padding: 12,
                  background: AC.okTint,
                  borderRadius: 10,
                  fontFamily: AC.font,
                  fontSize: 12.5,
                  color: "#0d6a45",
                  fontWeight: 500,
                  marginBottom: 14,
                }}
              >
                Account created. Share these credentials with{" "}
                <b>{name || email}</b>. The password won't be shown again.
              </div>
              <CredentialRow label="Email" value={email} />
              <CredentialRow label="Password" value={password} mono />
              <CredentialRow
                label="Login URL"
                value={
                  role === "manager"
                    ? "https://morpheus-admin.vercel.app/login"
                    : "https://morpheusta-khaki-omega.vercel.app/login"
                }
              />
              <div style={{ display: "flex", gap: 8, marginTop: 14, justifyContent: "flex-end" }}>
                <Btn onClick={copyAll}>Copy all</Btn>
                <Btn kind="primary" onClick={onCreated}>
                  Done
                </Btn>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ModalField({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          fontFamily: AC.font,
          fontSize: 11,
          color: AC.mute,
          fontWeight: 700,
          letterSpacing: 0.3,
          textTransform: "uppercase",
          marginBottom: 6,
        }}
      >
        {label}
        {required && <span style={{ color: AC.danger, marginLeft: 4 }}>*</span>}
      </div>
      {children}
      {hint && (
        <div
          style={{
            fontFamily: AC.font,
            fontSize: 11,
            color: AC.mute,
            marginTop: 4,
          }}
        >
          {hint}
        </div>
      )}
    </div>
  );
}

function RoleButton({
  active,
  onClick,
  title,
  sub,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  sub: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        padding: "10px 12px",
        borderRadius: 10,
        background: active ? AC.brandSoft : "#fff",
        border: `1px solid ${active ? AC.brand : AC.line}`,
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      <div
        style={{
          fontFamily: AC.font,
          fontSize: 13,
          fontWeight: 600,
          color: active ? AC.brandInk : AC.ink,
          letterSpacing: -0.1,
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontFamily: AC.font,
          fontSize: 11,
          color: active ? AC.brandDeep : AC.mute,
          marginTop: 2,
        }}
      >
        {sub}
      </div>
    </button>
  );
}

function CredentialRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* no-op */
    }
  };
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "9px 11px",
        background: AC.bg,
        borderRadius: 8,
        marginBottom: 8,
        fontFamily: AC.font,
        fontSize: 12.5,
      }}
    >
      <div
        style={{
          width: 80,
          color: AC.mute,
          fontWeight: 600,
          letterSpacing: 0.2,
          textTransform: "uppercase",
          fontSize: 10.5,
        }}
      >
        {label}
      </div>
      <div
        style={{
          flex: 1,
          color: AC.ink,
          fontWeight: 500,
          fontFamily: mono ? AC.fontMono : AC.font,
          wordBreak: "break-all",
        }}
      >
        {value}
      </div>
      <button
        type="button"
        onClick={copy}
        title="Copy"
        style={{ ...iconBtnStyle, background: copied ? AC.okTint : "#fff" }}
      >
        <AGlyph
          name={copied ? "check" : "edit"}
          size={13}
          color={copied ? "#0d6a45" : AC.mute}
        />
      </button>
    </div>
  );
}

const modalInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 11px",
  borderRadius: 10,
  border: `1px solid ${AC.line}`,
  background: "#fff",
  fontFamily: AC.font,
  fontSize: 13.5,
  color: AC.ink,
  boxSizing: "border-box",
};

const iconBtnStyle: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 8,
  border: `1px solid ${AC.line}`,
  background: "#fff",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

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
