// Mock data — direct port of ADMIN_DATA from admin-shell.jsx, plus extensions
// for screens beyond Live Ops. Replace this file with a real API in Phase 2.

import type {
  Rep,
  Customer,
  Shift,
  Exception,
  FeedItem,
  TaskTemplate,
  AuditEntry,
  LibraryFile,
} from "./types";

export const ORG = {
  name: "Atlas Field Co",
  plan: "Growth · 87 reps",
};

export const CURRENT_USER = {
  name: "Sasha Whittle",
  email: "sasha@atlasfield.co",
  role: "Field Ops Manager",
  initials: "SW",
};

export const REPS: Rep[] = [
  { id: "r1", name: "Marcus Lin", initials: "ML", region: "North", phone: "+1 555 0102", shifts: 312, late: 4, offsite: 1, completion: 96, status: "onsite", since: "08:14", shiftCustomer: "GreenWave Innovations", joined: "2023-04-12", email: "m.lin@atlasfield.co", role: "Field Rep" },
  { id: "r2", name: "Priya Achebe", initials: "PA", region: "North", phone: "+1 555 0118", shifts: 287, late: 12, offsite: 0, completion: 89, status: "travelling", since: "07:55", shiftCustomer: "NextGenTech", joined: "2023-09-02", email: "p.achebe@atlasfield.co", role: "Field Rep" },
  { id: "r3", name: "Jonas Verde", initials: "JV", region: "South", phone: "+1 555 0173", shifts: 451, late: 2, offsite: 0, completion: 99, status: "onsite", since: "08:02", shiftCustomer: "OptimaSolutions", joined: "2022-01-23", email: "j.verde@atlasfield.co", role: "Lead Rep" },
  { id: "r4", name: "Hattie Roe", initials: "HR", region: "South", phone: "+1 555 0140", shifts: 198, late: 6, offsite: 2, completion: 91, status: "onbreak", since: "12:32", shiftCustomer: "OptimaSolutions", joined: "2024-03-04", email: "h.roe@atlasfield.co", role: "Field Rep" },
  { id: "r5", name: "Devon Ortiz", initials: "DO", region: "East", phone: "+1 555 0166", shifts: 219, late: 19, offsite: 5, completion: 78, status: "late", since: "—", shiftCustomer: "SiteB Logistics", joined: "2023-07-11", email: "d.ortiz@atlasfield.co", role: "Field Rep" },
  { id: "r6", name: "Mira Whitehouse", initials: "MW", region: "East", phone: "+1 555 0184", shifts: 144, late: 0, offsite: 0, completion: 100, status: "onsite", since: "08:00", shiftCustomer: "Protonix", joined: "2024-08-15", email: "m.white@atlasfield.co", role: "Field Rep" },
  { id: "r7", name: "Conor Bell", initials: "CB", region: "West", phone: "+1 555 0119", shifts: 376, late: 3, offsite: 1, completion: 95, status: "travelling", since: "08:21", shiftCustomer: "Highmark Retail", joined: "2022-11-09", email: "c.bell@atlasfield.co", role: "Lead Rep" },
  { id: "r8", name: "Ruth Imani", initials: "RI", region: "West", phone: "+1 555 0152", shifts: 263, late: 8, offsite: 0, completion: 92, status: "offsite", since: "08:09", shiftCustomer: "Highmark Retail", joined: "2023-06-28", email: "r.imani@atlasfield.co", role: "Field Rep" },
  { id: "r9", name: "Yusuf Park", initials: "YP", region: "North", phone: "+1 555 0165", shifts: 109, late: 1, offsite: 0, completion: 97, status: "offline", since: "—", shiftCustomer: "—", joined: "2024-11-22", email: "y.park@atlasfield.co", role: "Field Rep" },
  { id: "r10", name: "Anika Felder", initials: "AF", region: "South", phone: "+1 555 0143", shifts: 421, late: 5, offsite: 1, completion: 94, status: "onsite", since: "08:11", shiftCustomer: "Aria Cosmetics", joined: "2021-09-30", email: "a.felder@atlasfield.co", role: "Lead Rep" },
  { id: "r11", name: "Theo Kowalski", initials: "TK", region: "East", phone: "+1 555 0177", shifts: 78, late: 0, offsite: 0, completion: 100, status: "offline", since: "—", shiftCustomer: "—", joined: "2025-01-06", email: "t.kowal@atlasfield.co", role: "Field Rep" },
  { id: "r12", name: "Zara Bloom", initials: "ZB", region: "West", phone: "+1 555 0190", shifts: 188, late: 11, offsite: 3, completion: 85, status: "onbreak", since: "12:14", shiftCustomer: "Aria Cosmetics", joined: "2024-02-19", email: "z.bloom@atlasfield.co", role: "Field Rep" },
];

export const CUSTOMERS: Customer[] = [
  { id: "c1", name: "GreenWave Innovations", initials: "GW", code: "#1208", region: "North", sites: 4, geofence: 75, shiftsThisWeek: 22, color: "#D9493D", tier: "Premium" },
  { id: "c2", name: "NextGenTech", initials: "NG", code: "#1455", region: "North", sites: 3, geofence: 50, shiftsThisWeek: 14, color: "#E2A434", tier: "Standard" },
  { id: "c3", name: "OptimaSolutions", initials: "OS", code: "#0921", region: "South", sites: 6, geofence: 100, shiftsThisWeek: 31, color: "#2E9C82", tier: "Premium" },
  { id: "c4", name: "SiteB Logistics", initials: "SB", code: "#1873", region: "East", sites: 2, geofence: 75, shiftsThisWeek: 8, color: "#2E4FB8", tier: "Standard" },
  { id: "c5", name: "Protonix", initials: "PR", code: "#1101", region: "East", sites: 5, geofence: 60, shiftsThisWeek: 18, color: "#C55A2E", tier: "Standard" },
  { id: "c6", name: "Aria Cosmetics", initials: "AC", code: "#1633", region: "South", sites: 7, geofence: 50, shiftsThisWeek: 26, color: "#8E4ECC", tier: "Premium" },
  { id: "c7", name: "Highmark Retail", initials: "HM", code: "#0742", region: "West", sites: 9, geofence: 75, shiftsThisWeek: 33, color: "#1FA971", tier: "Premium" },
];

export const TODAYS_SHIFTS: Shift[] = [
  { id: "s1", repId: "r1", customerId: "c1", start: "08:00", end: "12:00", state: "in-progress", checkedIn: "08:14", tasksDone: 2, tasksTotal: 4, late: false },
  { id: "s2", repId: "r2", customerId: "c2", start: "08:00", end: "11:30", state: "travelling", checkedIn: null, tasksDone: 0, tasksTotal: 3, late: false },
  { id: "s3", repId: "r3", customerId: "c3", start: "08:00", end: "13:00", state: "in-progress", checkedIn: "08:02", tasksDone: 4, tasksTotal: 5, late: false },
  { id: "s4", repId: "r4", customerId: "c3", start: "08:30", end: "12:30", state: "on-break", checkedIn: "08:35", tasksDone: 3, tasksTotal: 4, late: false },
  { id: "s5", repId: "r5", customerId: "c4", start: "08:00", end: "11:00", state: "late", checkedIn: null, tasksDone: 0, tasksTotal: 3, late: true },
  { id: "s6", repId: "r6", customerId: "c5", start: "08:00", end: "12:00", state: "in-progress", checkedIn: "08:00", tasksDone: 4, tasksTotal: 4, late: false },
  { id: "s7", repId: "r7", customerId: "c7", start: "08:30", end: "12:30", state: "travelling", checkedIn: null, tasksDone: 0, tasksTotal: 4, late: false },
  { id: "s8", repId: "r8", customerId: "c7", start: "08:00", end: "12:00", state: "in-progress", checkedIn: "08:09", tasksDone: 1, tasksTotal: 4, late: false, offsite: true },
  { id: "s9", repId: "r10", customerId: "c6", start: "08:00", end: "12:30", state: "in-progress", checkedIn: "08:11", tasksDone: 3, tasksTotal: 5, late: false },
  { id: "s10", repId: "r12", customerId: "c6", start: "08:30", end: "13:00", state: "on-break", checkedIn: "08:42", tasksDone: 2, tasksTotal: 4, late: true },
  { id: "s11", repId: null, customerId: "c2", start: "13:00", end: "17:00", state: "unassigned", checkedIn: null, tasksDone: 0, tasksTotal: 3, late: false },
  { id: "s12", repId: null, customerId: "c5", start: "13:00", end: "16:30", state: "unassigned", checkedIn: null, tasksDone: 0, tasksTotal: 4, late: false },
];

export const KPIS = {
  repsActive: 8,
  repsTotal: 12,
  shiftsToday: 12,
  shiftsCompleted: 0,
  onTimePct: 83,
  exceptionsOpen: 3,
  avgCompletion: 92,
};

export const FEED: FeedItem[] = [
  { ts: "08:42", repId: "r12", kind: "late", msg: "checked in 12 min late · Aria Cosmetics" },
  { ts: "08:35", repId: "r4", kind: "checkin", msg: "checked in to OptimaSolutions" },
  { ts: "08:21", repId: "r7", kind: "travel", msg: "started travelling" },
  { ts: "08:14", repId: "r1", kind: "checkin", msg: "checked in to GreenWave Innovations" },
  { ts: "08:11", repId: "r10", kind: "checkin", msg: "checked in to Aria Cosmetics" },
  { ts: "08:09", repId: "r8", kind: "offsite", msg: "checked in OFF-SITE · 380m from Highmark" },
  { ts: "08:02", repId: "r3", kind: "checkin", msg: "checked in to OptimaSolutions" },
  { ts: "08:00", repId: "r6", kind: "checkin", msg: "checked in to Protonix" },
  { ts: "07:55", repId: "r2", kind: "travel", msg: "started travelling" },
];

export const EXCEPTIONS: Exception[] = [
  { id: "e1", kind: "late", repId: "r5", ts: "08:18", text: "No check-in 18 min after start", meta: "SiteB Logistics · 08:00", severity: "high", status: "open" },
  { id: "e2", kind: "offsite", repId: "r8", ts: "08:09", text: "Checked in 380m outside geofence", meta: "Highmark Retail · 08:09", severity: "high", status: "open" },
  { id: "e3", kind: "late", repId: "r12", ts: "13:14", text: "Returned from break 12 min late", meta: "Aria Cosmetics · 13:14", severity: "low", status: "open" },
];

export const TASK_TEMPLATES: TaskTemplate[] = [
  { id: "t1", name: "Stock count — beverages aisle", customerId: "c1", frequency: "Daily", estTime: "15 min", requires: ["Photo", "Quantity"], appliedTo: 4, lastUsed: "2 hours ago" },
  { id: "t2", name: "Cooler temperature check", customerId: "c1", frequency: "Daily", estTime: "5 min", requires: ["Photo", "Reading"], appliedTo: 4, lastUsed: "3 hours ago" },
  { id: "t3", name: "POS display audit", customerId: "c2", frequency: "Weekly", estTime: "20 min", requires: ["Photo"], appliedTo: 3, lastUsed: "Yesterday" },
  { id: "t4", name: "Promotional materials placement", customerId: "c3", frequency: "Per visit", estTime: "10 min", requires: ["Photo", "Notes"], appliedTo: 6, lastUsed: "1 hour ago" },
  { id: "t5", name: "Shelf compliance check", customerId: "c3", frequency: "Daily", estTime: "12 min", requires: ["Photo"], appliedTo: 6, lastUsed: "30 min ago" },
  { id: "t6", name: "Inventory verification", customerId: "c5", frequency: "Weekly", estTime: "30 min", requires: ["Quantity", "Notes"], appliedTo: 5, lastUsed: "2 days ago" },
  { id: "t7", name: "Customer feedback survey", customerId: "c6", frequency: "Monthly", estTime: "8 min", requires: ["Form"], appliedTo: 7, lastUsed: "5 days ago" },
  { id: "t8", name: "End-of-shift photo report", customerId: "c7", frequency: "Per visit", estTime: "5 min", requires: ["Photo"], appliedTo: 9, lastUsed: "20 min ago", blockCheckout: true },
];

export const AUDIT_LOG: AuditEntry[] = [
  { id: "a1", actor: "Sasha Whittle", actorInitials: "SW", ts: "Today · 09:14", action: "Resolved exception", target: "Late check-in · Devon Ortiz", targetType: "exception", diff: "Status: open → resolved" },
  { id: "a2", actor: "Sasha Whittle", actorInitials: "SW", ts: "Today · 08:42", action: "Adjusted geofence radius", target: "Highmark Retail · Site B", targetType: "site", diff: "75m → 100m" },
  { id: "a3", actor: "System", actorInitials: "SY", ts: "Today · 08:18", action: "Flagged off-site check-in", target: "Ruth Imani · Highmark Retail", targetType: "exception" },
  { id: "a4", actor: "Marcus Lin", actorInitials: "ML", ts: "Today · 07:30", action: "Submitted task report", target: "Stock count · GreenWave", targetType: "task" },
  { id: "a5", actor: "Sasha Whittle", actorInitials: "SW", ts: "Yesterday · 17:42", action: "Created shift", target: "Anika Felder · Aria Cosmetics", targetType: "shift" },
  { id: "a6", actor: "Sasha Whittle", actorInitials: "SW", ts: "Yesterday · 15:18", action: "Invited rep", target: "theo.kowalski@…", targetType: "rep" },
  { id: "a7", actor: "Sasha Whittle", actorInitials: "SW", ts: "Yesterday · 14:02", action: "Updated permissions", target: "Jonas Verde", targetType: "rep", diff: "Role: Field Rep → Lead Rep" },
  { id: "a8", actor: "System", actorInitials: "SY", ts: "Yesterday · 11:00", action: "Auto-archived shifts", target: "12 completed shifts", targetType: "shift" },
];

export const LIBRARY_FILES: LibraryFile[] = [
  { id: "f1", name: "Brand guidelines 2025.pdf", type: "PDF", size: "2.4 MB", customerId: "c1", uploadedBy: "Sasha W.", uploadedAt: "2 days ago", thumbColor: "#D9365F" },
  { id: "f2", name: "Site B floor plan.png", type: "Image", size: "412 KB", customerId: "c4", uploadedBy: "Conor B.", uploadedAt: "1 week ago", thumbColor: "#15B4D6" },
  { id: "f3", name: "Compliance checklist.docx", type: "Doc", size: "98 KB", customerId: "c3", uploadedBy: "Sasha W.", uploadedAt: "3 days ago", thumbColor: "#2E4FB8" },
  { id: "f4", name: "Q1 audit report.xlsx", type: "Sheet", size: "1.1 MB", uploadedBy: "Sasha W.", uploadedAt: "Yesterday", thumbColor: "#1FA971" },
  { id: "f5", name: "Training video — onboarding.mp4", type: "Video", size: "84 MB", uploadedBy: "Sasha W.", uploadedAt: "2 weeks ago", thumbColor: "#8E4ECC" },
  { id: "f6", name: "Geofence policy.pdf", type: "PDF", size: "320 KB", uploadedBy: "Sasha W.", uploadedAt: "1 month ago", thumbColor: "#D9365F" },
  { id: "f7", name: "Aria visual guidelines.pdf", type: "PDF", size: "5.6 MB", customerId: "c6", uploadedBy: "Sasha W.", uploadedAt: "5 days ago", thumbColor: "#D9365F" },
  { id: "f8", name: "Highmark store list.csv", type: "Sheet", size: "44 KB", customerId: "c7", uploadedBy: "Sasha W.", uploadedAt: "1 week ago", thumbColor: "#1FA971" },
];

// Helpers
export const getRep = (id: string | null | undefined): Rep | undefined =>
  id ? REPS.find((r) => r.id === id) : undefined;

export const getCustomer = (id: string | null | undefined): Customer | undefined =>
  id ? CUSTOMERS.find((c) => c.id === id) : undefined;

export const NAV_ITEMS = [
  { id: "ops", label: "Live Ops", glyph: "ops", href: "/" },
  { id: "reps", label: "Reps", glyph: "reps", href: "/reps" },
  { id: "customers", label: "Customers", glyph: "customer", href: "/customers" },
  { id: "schedule", label: "Schedule", glyph: "cal", href: "/schedule" },
  { id: "requests", label: "Requests", glyph: "send", href: "/requests" },
  { id: "tasks", label: "Tasks", glyph: "tasks", href: "/tasks" },
  { id: "reports", label: "Reports", glyph: "chart", href: "/reports" },
  { id: "library", label: "Library", glyph: "lib", href: "/library" },
  { id: "notify", label: "Notifications", glyph: "send", href: "/notify" },
  { id: "audit", label: "Audit log", glyph: "audit", href: "/audit" },
  { id: "settings", label: "Settings", glyph: "settings", href: "/settings" },
] as const;
