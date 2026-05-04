"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AC } from "@/lib/tokens";
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
 * Same shape as the mobile app's AuthGate.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() || "/";
  const [status, setStatus] = useState<Status>("checking");

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

  if (status === "anon" && !isPublic(pathname)) return null;
  if (status === "authed" && pathname === "/login") return null;

  return <>{children}</>;
}
