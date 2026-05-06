"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AC } from "@/lib/tokens";
import { getSession, getUser, onAuthChange, signOut } from "@/lib/auth";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

type Status = "checking" | "authed" | "anon" | "wrong-role";

const PUBLIC_PATHS = ["/login"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

async function fetchRole(): Promise<string | null> {
  if (!supabase) return null;
  const u = await getUser();
  if (!u) return null;
  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", u.id)
    .maybeSingle();
  return (data as { role?: string } | null)?.role ?? null;
}

/**
 * AuthGate — sits inside the layout and redirects:
 *  - unauthenticated users → /login
 *  - authenticated users on /login → /
 *  - authenticated users whose profiles.role !== 'manager' → "Admin only"
 *    screen with a sign-out button. Reps log into the mobile app, not
 *    this one.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() || "/";
  const [status, setStatus] = useState<Status>("checking");
  // Token refresh fires onAuthChange roughly every hour, plus on focus
  // and on tab restore. We only need to re-evaluate the role on a real
  // sign-in / sign-out — a token refresh keeps the same user. Without
  // this guard, repeated overlapping evaluate() calls could race and
  // briefly flip status, which felt like nav links "not loading".
  const evaluatingRef = useRef(false);
  const lastResolvedUserRef = useRef<string | "anon" | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!isSupabaseConfigured()) {
      setStatus("authed");
      return;
    }
    const evaluate = async () => {
      if (evaluatingRef.current) return; // skip overlapping re-fires
      evaluatingRef.current = true;
      try {
        const s = await getSession();
        if (cancelled) return;
        if (!s) {
          lastResolvedUserRef.current = "anon";
          setStatus("anon");
          return;
        }
        const userId = s.user?.id ?? null;
        // Same user as last time → keep current status (avoid the
        // checking spinner and the role re-fetch on every token refresh).
        if (userId && userId === lastResolvedUserRef.current) return;

        const role = await fetchRole();
        if (cancelled) return;
        lastResolvedUserRef.current = userId;
        setStatus(role === "manager" ? "authed" : "wrong-role");
      } finally {
        evaluatingRef.current = false;
      }
    };
    evaluate();
    const unsubscribe = onAuthChange(() => {
      // Reset the user-cache so a real sign-in / sign-out re-evaluates;
      // token refresh events keep the cached user id and short-circuit.
      evaluate();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (status === "checking") return;
    if (status === "anon" && !isPublic(pathname)) {
      router.replace("/login");
    } else if (status === "authed" && pathname === "/login") {
      router.replace("/");
    }
  }, [status, pathname, router]);

  if (status === "checking") {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: AC.bg,
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            border: `3px solid ${AC.line}`,
            borderTopColor: AC.brand,
            animation: "spin 0.9s linear infinite",
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (status === "wrong-role") {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: AC.bg,
          fontFamily: AC.font,
        }}
      >
        <div
          style={{
            background: "#fff",
            border: `1px solid ${AC.line}`,
            borderRadius: 14,
            padding: 28,
            maxWidth: 420,
            width: "calc(100% - 40px)",
            textAlign: "center",
            boxShadow: "0 10px 30px rgba(10,15,30,.06)",
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 99,
              margin: "0 auto 12px",
              background: AC.warnTint,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 22,
            }}
            aria-hidden
          >
            🔒
          </div>
          <div style={{ fontSize: 17, fontWeight: 700, color: AC.ink, letterSpacing: -0.3 }}>
            Admin console only
          </div>
          <div
            style={{
              fontSize: 13,
              color: AC.mute,
              lineHeight: 1.55,
              marginTop: 8,
            }}
          >
            This account is a field rep, not a manager. Reps use the mobile app:
            <br />
            <a
              href="https://morpheusta-khaki-omega.vercel.app"
              style={{ color: AC.brandDeep, fontWeight: 600 }}
            >
              morpheusta-khaki-omega.vercel.app
            </a>
          </div>
          <button
            type="button"
            onClick={() => {
              // Fire-and-forget signOut so a hung network call can't
              // strand the user on this lock screen. Belt-and-braces:
              // also wipe the Supabase token from localStorage and
              // force a hard reload to /login. On the next render,
              // AuthGate sees no session and shows the login form.
              try {
                void signOut().catch(() => {});
              } catch {
                /* noop */
              }
              try {
                if (typeof window !== "undefined") {
                  for (let i = window.localStorage.length - 1; i >= 0; i--) {
                    const k = window.localStorage.key(i);
                    if (
                      k &&
                      (k.startsWith("sb-") || k.includes("auth-token"))
                    ) {
                      window.localStorage.removeItem(k);
                    }
                  }
                }
              } catch {
                /* noop */
              }
              window.location.href = "/login";
            }}
            style={{
              marginTop: 18,
              padding: "10px 16px",
              border: `1px solid ${AC.line}`,
              borderRadius: 10,
              background: "#fff",
              color: AC.ink,
              fontFamily: AC.font,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  if (status === "anon" && !isPublic(pathname)) return null;
  if (status === "authed" && pathname === "/login") return null;

  return <>{children}</>;
}
