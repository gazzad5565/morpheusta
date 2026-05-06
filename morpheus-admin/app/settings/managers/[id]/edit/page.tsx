"use client";

/**
 * /settings/managers/[id]/edit — edit a single user.
 *
 * Lets a manager change another user's name, email, role, reset their
 * password, or delete the account. All writes go through /api/users
 * which checks the caller is a manager via service-role.
 */

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AdminShell } from "@/components/shell/AdminShell";
import { Btn } from "@/components/ui/Btn";
import { Card, SectionTitle } from "@/components/ui/Card";
import { AGlyph } from "@/components/ui/AGlyph";
import { AC } from "@/lib/tokens";
import { supabase } from "@/lib/supabase";
import { getUser } from "@/lib/auth";
import { displayName, type Profile } from "@/lib/profiles-store";
import { updateUser, deleteUser, randomPassword } from "@/lib/users-admin";

function formatJoined(iso: string | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function EditManagerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const { id } = use(params);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"manager" | "rep">("rep");
  const [newPassword, setNewPassword] = useState("");
  const [showPass, setShowPass] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase) {
        setLoading(false);
        return;
      }
      const u = await getUser();
      if (!cancelled) setMyId(u?.id ?? null);
      const { data, error: dbErr } = await supabase
        .from("profiles")
        .select("id, email, name, role, created_at")
        .eq("id", id)
        .maybeSingle();
      if (cancelled) return;
      if (dbErr || !data) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      const p = data as Profile;
      setProfile(p);
      setName(p.name || "");
      setEmail(p.email);
      setRole(p.role === "manager" ? "manager" : "rep");
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const onSave = async () => {
    if (busy) return;
    setError(null);
    setMessage(null);
    if (!email.trim()) return setError("Email is required.");
    setBusy(true);
    const r = await updateUser({
      id,
      email: email.trim() !== profile?.email ? email.trim() : undefined,
      name,
      role,
      password: newPassword.length > 0 ? newPassword : undefined,
    });
    setBusy(false);
    if (!r.ok) {
      setError(r.error || "Couldn't save.");
      return;
    }
    setMessage("Saved.");
    if (newPassword.length > 0) {
      setMessage(
        `Saved. Password updated to: ${newPassword}  ← share with the user, this won't be shown again.`
      );
      setNewPassword("");
    }
    setProfile((p) =>
      p ? { ...p, email: email.trim() || p.email, name, role } : p
    );
  };

  const onDelete = async () => {
    if (busy) return;
    if (id === myId) {
      alert("You can't delete your own account from here.");
      return;
    }
    if (
      !confirm(
        `Permanently delete ${profile ? displayName(profile) : "this user"}? This signs them out and can't be undone.`
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    const r = await deleteUser(id);
    setBusy(false);
    if (!r.ok) {
      setError(r.error || "Couldn't delete.");
      return;
    }
    router.push("/settings/managers");
  };

  if (loading) {
    return (
      <AdminShell breadcrumbs={["Home", "Settings", "Managers", "…"]}>
        <div style={{ padding: 32, fontFamily: AC.font, fontSize: 13, color: AC.mute }}>
          Loading user…
        </div>
      </AdminShell>
    );
  }

  if (notFound || !profile) {
    return (
      <AdminShell breadcrumbs={["Home", "Settings", "Managers", "Not found"]}>
        <div style={{ padding: 32 }}>
          <Card padding={24}>
            <div style={{ fontFamily: AC.font, fontSize: 14, color: AC.ink, marginBottom: 8 }}>
              No user found with this ID.
            </div>
            <Btn onClick={() => router.push("/settings/managers")}>Back to Managers</Btn>
          </Card>
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell
      breadcrumbs={["Home", "Settings", "Managers", { label: displayName(profile) }]}
      actions={
        <Btn size="sm" onClick={() => router.push("/settings/managers")}>
          Back
        </Btn>
      }
    >
      <div
        style={{
          padding: 20,
          display: "grid",
          gridTemplateColumns: "1fr 320px",
          gap: 16,
          alignItems: "start",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Card padding={20}>
            <SectionTitle>Profile</SectionTitle>

            <Field label="Full name">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="(optional)"
                style={inputStyle}
              />
            </Field>

            <Field label="Email" required>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={inputStyle}
              />
            </Field>

            <Field label="Role" required>
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
              {id === myId && role === "rep" && (
                <div
                  style={{
                    fontFamily: AC.font,
                    fontSize: 11.5,
                    color: AC.warn,
                    marginTop: 6,
                  }}
                >
                  ⚠️ This is YOUR account — saving as rep locks you out of the admin console
                  on next reload.
                </div>
              )}
            </Field>
          </Card>

          <Card padding={20}>
            <SectionTitle>Reset password</SectionTitle>
            <div
              style={{
                fontFamily: AC.font,
                fontSize: 12.5,
                color: AC.mute,
                marginTop: 4,
                marginBottom: 14,
                lineHeight: 1.5,
              }}
            >
              Sets a new password for this user. They'll keep their current password until
              you Save. Leave blank to leave the password unchanged.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type={showPass ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New password (≥ 6 chars), or leave blank"
                style={{ ...inputStyle, fontFamily: AC.fontMono, flex: 1 }}
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
                onClick={() => {
                  setNewPassword(randomPassword(12));
                  setShowPass(true);
                }}
                title="Generate"
                style={iconBtnStyle}
              >
                <AGlyph name="refresh" size={14} color={AC.mute} />
              </button>
            </div>
            {newPassword.length > 0 && newPassword.length < 6 && (
              <div
                style={{
                  fontFamily: AC.font,
                  fontSize: 11.5,
                  color: AC.danger,
                  marginTop: 6,
                }}
              >
                Password must be at least 6 characters.
              </div>
            )}
          </Card>

          {error && (
            <div
              style={{
                padding: "10px 12px",
                background: AC.dangerTint,
                color: "#9c1a3c",
                borderRadius: 10,
                fontFamily: AC.font,
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              {error}
            </div>
          )}
          {message && (
            <div
              style={{
                padding: "10px 12px",
                background: AC.brandSoft,
                color: AC.brandInk,
                borderRadius: 10,
                fontFamily: AC.font,
                fontSize: 13,
                fontWeight: 500,
                whiteSpace: "pre-wrap",
              }}
            >
              {message}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
            <Btn kind="danger" onClick={onDelete} disabled={busy || id === myId}>
              Delete user
            </Btn>
            <div style={{ display: "flex", gap: 8 }}>
              <Btn onClick={() => router.push("/settings/managers")} disabled={busy}>
                Cancel
              </Btn>
              <Btn kind="primary" icon="check" onClick={onSave} disabled={busy}>
                {busy ? "Saving…" : "Save changes"}
              </Btn>
            </div>
          </div>
        </div>

        <Card padding={16}>
          <div
            style={{
              fontFamily: AC.font,
              fontSize: 11,
              fontWeight: 600,
              color: AC.mute,
              letterSpacing: 0.4,
              textTransform: "uppercase",
              marginBottom: 8,
            }}
          >
            Account
          </div>
          <div
            style={{
              fontFamily: AC.font,
              fontSize: 12.5,
              color: AC.ink2,
              lineHeight: 1.7,
            }}
          >
            <div>
              <b>Joined:</b> {formatJoined(profile.created_at)}
            </div>
            <div style={{ wordBreak: "break-all" }}>
              <b>User ID:</b>{" "}
              <span style={{ fontFamily: AC.fontMono, fontSize: 11 }}>{profile.id}</span>
            </div>
          </div>
          <div
            style={{
              marginTop: 14,
              padding: "9px 11px",
              borderRadius: 8,
              background: AC.bg,
              fontFamily: AC.font,
              fontSize: 11.5,
              color: AC.mute,
              lineHeight: 1.5,
            }}
          >
            Changes take effect on the user&apos;s next page reload. Email + password
            updates are processed via Supabase&apos;s admin API server-side.
          </div>
          <div style={{ marginTop: 12 }}>
            <Link
              href="/settings/managers"
              style={{
                fontFamily: AC.font,
                fontSize: 12,
                color: AC.brandDeep,
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              ← All users
            </Link>
          </div>
        </Card>
      </div>
    </AdminShell>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
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

const inputStyle: React.CSSProperties = {
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
