/**
 * Nav configuration for the admin sidebar.
 *
 * This file used to ship with mock arrays (REPS, CUSTOMERS, TODAYS_SHIFTS,
 * KPIS, FEED, EXCEPTIONS, TASK_TEMPLATES, AUDIT_LOG, LIBRARY_FILES, ORG,
 * CURRENT_USER) so the UI could render before the Supabase wiring was
 * done. All of those have been removed — every page reads from the DB.
 *
 * The only thing that lives here now is NAV_ITEMS, which is real config,
 * not mock data. Filename is left as `mock-data.ts` so existing imports
 * keep working; rename in a follow-up if desired.
 */

export const NAV_ITEMS = [
  { id: "ops", label: "Live Ops", glyph: "ops", href: "/" },
  { id: "reps", label: "Reps", glyph: "reps", href: "/reps" },
  { id: "customers", label: "Customers", glyph: "customer", href: "/customers" },
  { id: "schedule", label: "Schedule / Calendar", glyph: "cal", href: "/schedule" },
  { id: "tasks", label: "Tasks", glyph: "tasks", href: "/tasks" },
  { id: "reports", label: "Reports", glyph: "chart", href: "/reports" },
  { id: "library", label: "Library", glyph: "lib", href: "/library" },
  // "Messaging" (renamed from "Notifications" May 13). Today it's the
  // org-wide push-notifications inbox/settings; the next iteration
  // will let managers compose and send messages to reps individually
  // or in bulk, with optional scheduling — hence the broader label.
  // Messaging shipped on May 13 (Feature E) — was previously
  // comingSoon=true while the route was a placeholder. The composer
  // at /notify is now real (audience picker, schedule, push + in-app
  // delivery), so the nav entry is live.
  { id: "notify", label: "Messaging", glyph: "send", href: "/notify" },
  { id: "settings", label: "Settings", glyph: "settings", href: "/settings" },
] as const;
