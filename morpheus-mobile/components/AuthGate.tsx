"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { MC } from "@/lib/tokens";
import { getSession, onAuthChange } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase";

type Status = "checking" | "authed" | "anon";

const PUBLIC_PATHS = ["/login"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

/**
 * AuthGate — sits inside the layout and redirects:
 *  - unauthenticated users → /login
 *  - authenticated users on /login → /
 *
 * If Supabase isn't configured (e.g. local dev without env), we let everything
 * through so the app stays usable.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() || "/";
  const [status, setStatus] = useState<Status>("checking");

  // Initial check + subscribe to changes
  useEffect(() => {
    let cancelled = false;
    if (!isSupabaseConfigured()) {
      setStatus("authed");
      return;
    }
    getSession().then((s) => {
      if (cancelled) return;
      setStatus(s ? "authed" : "anon");
    });
    const unsubscribe = onAuthChange((s) => {
      setStatus(s ? "authed" : "anon");
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  // Redirect side-effect runs whenever status or pathname changes
  useEffect(() => {
    if (status === "checking") return;
    if (status === "anon" && !isPublic(pathname)) {
      router.replace("/login");
    } else if (status === "authed" && pathname === "/login") {
      router.replace("/");
    }
  }, [status, pathname, router]);

  // While checking, render a tiny splash so we don't flash content
  if (status === "checking") {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: MC.bg,
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            border: `3px solid ${MC.line}`,
            borderTopColor: MC.brand,
            animation: "mc-spin 0.9s linear infinite",
          }}
        />
      </div>
    );
  }

  // While redirecting from a protected page → /login, render nothing to avoid flicker
  if (status === "anon" && !isPublic(pathname)) return null;
  if (status === "authed" && pathname === "/login") return null;

  return <>{children}</>;
}
