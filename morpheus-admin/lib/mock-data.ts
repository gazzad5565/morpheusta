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
  // Workforce/Reps — kept the route as /reps (matches the codebase
  // throughout) but the label is the broader "Workforce" since the
  // section now covers reps + managers + role/auth admin too.
  { id: "reps", label: "Workforce", glyph: "reps", href: "/reps" },
  { id: "customers", label: "Customers", glyph: "customer", href: "/customers" },
  { id: "schedule", label: "Schedule / Calendar", glyph: "cal", href: "/schedule" },
  { id: "tasks", label: "Tasks", glyph: "tasks", href: "/tasks" },
  { id: "library", label: "Library", glyph: "lib", href: "/library" },
  // "Messaging" (renamed from "Notifications" May 13). Composer at
  // /notify is real (audience picker, schedule, push + in-app
  // delivery). Moved above Reports May 14 to group operations-y
  // tools (Tasks / Library / Messaging) before analytics (Reports).
  { id: "notify", label: "Messaging", glyph: "send", href: "/notify" },
  { id: "reports", label: "Reports", glyph: "chart", href: "/reports" },
  { id: "settings", label: "Settings", glyph: "settings", href: "/settings" },
] as const;
