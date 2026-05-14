"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { SideMenu } from "./SideMenu";
import { startRouteImprovementWatcher } from "@/lib/route-improvement-watcher";

interface MenuContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const MenuContext = createContext<MenuContextValue | null>(null);

/**
 * useMenu — read or set the side-menu open state.
 * Returns a no-op fallback if used outside a MenuShell, so callers don't crash.
 */
export function useMenu(): MenuContextValue {
  const ctx = useContext(MenuContext);
  if (!ctx) return { open: false, setOpen: () => {} };
  return ctx;
}

/**
 * MenuShell — wraps the app's content + the side-menu overlay so any AppHeader
 * can call openMenu() via useMenu().
 */
export function MenuShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  // Hourly route-improvement watcher. Lives at layout level so it
  // ticks regardless of which page the rep is on. Pauses naturally
  // when the app is closed (browser suspends timers on background
  // tabs anyway); a visibilitychange listener inside the watcher
  // catches the "came back after hours" case so the icon updates
  // promptly on re-foreground. See lib/route-improvement-watcher.ts.
  useEffect(() => {
    const stop = startRouteImprovementWatcher();
    return stop;
  }, []);
  return (
    <MenuContext.Provider value={{ open, setOpen }}>
      <div className="phone-content">{children}</div>
      <SideMenu />
    </MenuContext.Provider>
  );
}
