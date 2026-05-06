// Mock data for the Morpheus mobile app — replace with real API in Phase 2.
import { MC } from "./tokens";

export interface Shift {
  id: string;
  name: string;
  initials: string;
  color: string;
  code: number;
  start: string;
  end: string;
  distance: string;
}

export const SAMPLE = {
  shifts: [
    { id: "gw", name: "GreenWave Innovations", initials: "GW", color: MC.swatch.GW, code: 6, start: "08:00 AM", end: "05:00 PM", distance: "3 km away" },
    { id: "ng", name: "NextGenTech",            initials: "N",  color: MC.swatch.NG, code: 5, start: "08:00 AM", end: "05:00 PM", distance: "1 km away" },
    { id: "os", name: "OptimaSolutions",        initials: "O",  color: MC.swatch.OS, code: 4, start: "08:00 AM", end: "05:00 PM", distance: "5 km away" },
    { id: "sb", name: "Site B Sea Point",       initials: "SB", color: MC.swatch.SB, code: 31, start: "08:00 AM", end: "05:00 PM", distance: "8 km away" },
  ] as Shift[],
  unscheduled: [
    { id: "pr", name: "Protonix", initials: "P", color: MC.swatch.PR, code: 1, start: "", end: "", distance: "" },
  ] as Shift[],
};

/**
 * ALL_CUSTOMERS — full directory used by the "Add shift" search page.
 * Bigger than today's roster so the search feels real. Picks customer
 * colors from a small palette (loops if more than the palette has).
 */
const PALETTE = [
  MC.swatch.GW, MC.swatch.NG, MC.swatch.OS,
  MC.swatch.SB, MC.swatch.PR,
  "#8E4ECC", "#1FA971", "#2E9C82", "#C55A2E", "#5B7DC2",
];

export interface Customer {
  id: string;
  name: string;
  initials: string;
  color: string;
  code: number;
  region: string;
  city: string;
  latitude?: number | null;
  longitude?: number | null;
  geofence_radius_m?: number | null;
}

const ALL_CUSTOMERS_RAW: Omit<Customer, "color">[] = [
  { id: "gw",  name: "GreenWave Innovations", initials: "GW", code: 6,   region: "North", city: "Northgate" },
  { id: "ng",  name: "NextGenTech",           initials: "N",  code: 5,   region: "North", city: "Northgate" },
  { id: "os",  name: "OptimaSolutions",       initials: "O",  code: 4,   region: "South", city: "Southview" },
  { id: "sb",  name: "Site B Sea Point",      initials: "SB", code: 31,  region: "East",  city: "Sea Point" },
  { id: "pr",  name: "Protonix",              initials: "P",  code: 1,   region: "East",  city: "Eastvale" },
  { id: "ac",  name: "Aria Cosmetics",        initials: "AC", code: 12,  region: "South", city: "Southview" },
  { id: "hm",  name: "Highmark Retail",       initials: "HM", code: 22,  region: "West",  city: "Westport" },
  { id: "kk",  name: "Kismet Kitchens",       initials: "KK", code: 18,  region: "West",  city: "Westport" },
  { id: "br",  name: "BlueRock Foods",        initials: "BR", code: 9,   region: "North", city: "Northgate" },
  { id: "lt",  name: "Loomtide Apparel",      initials: "LT", code: 14,  region: "East",  city: "Eastvale" },
  { id: "vc",  name: "Vela Cosmetics",        initials: "VC", code: 27,  region: "South", city: "Southview" },
  { id: "ts",  name: "Tilstone Pharmacy",     initials: "TS", code: 7,   region: "West",  city: "Westport" },
  { id: "qs",  name: "Quayside Hardware",     initials: "QS", code: 19,  region: "East",  city: "Sea Point" },
  { id: "fm",  name: "Fairmile Markets",      initials: "FM", code: 3,   region: "North", city: "Northgate" },
];

export const ALL_CUSTOMERS: Customer[] = ALL_CUSTOMERS_RAW.map((c, i) => ({
  ...c,
  color: PALETTE[i % PALETTE.length],
}));

export interface Task {
  id: string;
  name: string;
  compulsory: boolean;
  duration: number;
  description: string;
  kind?: "task" | "break";
}

export const ACTIVE_SAMPLE_TASKS: Task[] = [
  { id: "t1", name: "Compulsory Standard Task", compulsory: true, duration: 5, description: "Confirm planogram compliance for the front-of-store display. Take a photo when complete." },
  { id: "t2", name: "Stock count – beverages",  compulsory: true, duration: 8, description: "Walk the beverage aisle and record stock counts in the form." },
  { id: "t3", name: "Promo decal swap",         compulsory: false, duration: 4, description: "Swap last week's promo decals for this week's. Photo not required." },
  { id: "t4", name: "Endcap reset",             compulsory: false, duration: 12, description: "Reset the seasonal endcap per Q3 reference image in the Library." },
];

export const ACTIVE_SAMPLE_BREAKS: Task[] = [
  { id: "b1", name: "30 Minute Lunch", compulsory: false, duration: 30, description: "", kind: "break" },
  { id: "b2", name: "15 Minute Tea",   compulsory: false, duration: 15, description: "", kind: "break" },
];

export interface LibFile {
  id: string;
  name: string;
  modified: string;
  size: string;
  isNew: boolean;
  type: "pdf" | "doc";
}

export interface LibImage {
  id: string;
  name: string;
  modified: string;
  isNew: boolean;
  swatch: string;
}

export const LIBRARY_DATA = {
  files: [
    { id: "f1", name: "Customer Library File", modified: "03 Jul 2024", size: "1.2 MB", isNew: true, type: "pdf" as const },
    { id: "f2", name: "Q3 Display Standards", modified: "27 Oct 2022", size: "35 KB", isNew: false, type: "pdf" as const },
    { id: "f3", name: "Promo Plan – Sea Point", modified: "27 Oct 2022", size: "28 KB", isNew: false, type: "doc" as const },
    { id: "f4", name: "Login screenshot", modified: "22 Jan 2024", size: "1 MB", isNew: true, type: "pdf" as const },
  ] as LibFile[],
  images: [
    { id: "i1", name: "Endcap reference", modified: "12 Mar 2025", isNew: true, swatch: "#7DB1A8" },
    { id: "i2", name: "Planogram A", modified: "12 Mar 2025", isNew: true, swatch: "#D9826F" },
    { id: "i3", name: "Promo decal", modified: "02 Feb 2025", isNew: false, swatch: "#E2A434" },
    { id: "i4", name: "Shelf strip", modified: "14 Jan 2025", isNew: false, swatch: "#5B7DC2" },
  ] as LibImage[],
};
