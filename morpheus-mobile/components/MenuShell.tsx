"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { SideMenu } from "./SideMenu";

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
  return (
    <MenuContext.Provider value={{ open, setOpen }}>
      <div className="phone-content">{children}</div>
      <SideMenu />
    </MenuContext.Provider>
  );
}
