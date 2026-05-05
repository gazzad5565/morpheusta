import type { StatusKey } from "./tokens";

export type Region = "North" | "South" | "East" | "West";
export type Role = "Field Rep" | "Lead Rep" | "Manager";

export interface Rep {
  id: string;
  name: string;
  initials: string;
  region: Region;
  phone: string;
  email: string;
  shifts: number;
  late: number;
  offsite: number;
  completion: number;
  status: StatusKey;
  since: string;
  shiftCustomer: string;
  joined: string;
  role?: Role;
}

export interface Customer {
  id: string;
  name: string;
  initials: string;
  code: string;
  region: Region;
  sites: number;
  geofence: number;
  shiftsThisWeek: number;
  color: string;
  tier?: "Premium" | "Standard";
  address?: string;
  latitude?: number;
  longitude?: number;
  active?: boolean;
}

export type ShiftState =
  | "in-progress"
  | "travelling"
  | "on-break"
  | "late"
  | "complete"
  | "unassigned"
  | "scheduled";

export interface Shift {
  id: string;
  repId: string | null;
  customerId: string;
  start: string;
  end: string;
  state: ShiftState;
  checkedIn: string | null;
  tasksDone: number;
  tasksTotal: number;
  late?: boolean;
  offsite?: boolean;
}

export interface Exception {
  id: string;
  kind: "late" | "offsite" | "missed";
  repId: string;
  shiftId?: string;
  ts: string;
  text: string;
  meta: string;
  severity?: "low" | "high";
  status?: "open" | "resolved";
}

export interface FeedItem {
  ts: string;
  repId: string;
  kind: "late" | "offsite" | "checkin" | "travel";
  msg: string;
}

export interface TaskTemplate {
  id: string;
  name: string;
  customerId: string;
  frequency: "Daily" | "Weekly" | "Monthly" | "Per visit";
  estTime: string;
  requires: string[];
  appliedTo: number;
  lastUsed: string;
  blockCheckout?: boolean;
}

export interface AuditEntry {
  id: string;
  actor: string;
  actorInitials: string;
  ts: string;
  action: string;
  target: string;
  targetType: string;
  diff?: string;
}

export interface LibraryFile {
  id: string;
  name: string;
  type: string;
  size: string;
  customerId?: string;
  uploadedBy: string;
  uploadedAt: string;
  thumbColor?: string;
}
