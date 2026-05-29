"use client";

/**
 * /notify — Messaging composer (Feature E, May 13).
 *
 * Replaces the "Coming soon" placeholder. Lets managers:
 *   - Pick an audience: all reps / all managers / everyone /
 *     specific users (multi-select)
 *   - Compose subject + body
 *   - Pick delivery channels: push and/or in-app (at least one)
 *   - Pick timing: send now, or schedule for a future time
 *   - See the recent messages list with status pills + cancel for
 *     pending scheduled ones.
 */

import { useEffect, useMemo, useState } from "react";
import { AdminShell } from "@/components/shell/AdminShell";
import { Btn } from "@/components/ui/Btn";
import { Card, SectionTitle } from "@/components/ui/Card";
import { AGlyph } from "@/components/ui/AGlyph";
import { AC } from "@/lib/tokens";
import { inputStyle, FilterSelect } from "@/components/ui/Filters";
import { listCustomers } from "@/lib/customers-store";
import { listAllAssignments } from "@/lib/assignments-store";
import type { Customer } from "@/lib/types";
import {
  composeMessage,
  cancelMessage,
  listMessages,
  subscribeMessages,
  type AudienceKind,
  type MessageRow,
} from "@/lib/messaging-store";
import { listProfiles, displayName, type Profile } from "@/lib/profiles-store";
import {
  getRepTypes,
  getManagerTypes,
  getRegions,
  getGroups,
  type RepTypeConfig,
  type ManagerTypeConfig,
} from "@/lib/settings-store";
import { RepAvatar } from "@/components/ui/Avatars";
import { initialsFromNameOrEmail } from "@/lib/format";

export default function NotifyPage() {
  // Compose form state
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [audienceKind, setAudienceKind] = useState<AudienceKind>("all_reps");
  const [pickedIds, setPickedIds] = useState<Set<string>>(() => new Set());
  const [deliverPush, setDeliverPush] = useState(true);
  const [deliverInApp, setDeliverInApp] = useState(true);
  // Scheduling — empty string in the datetime-local input means "send
  // now". Stored as a string until submit, parsed to ISO there.
  const [scheduledAtLocal, setScheduledAtLocal] = useState("");
  // Whether the manager has tapped "Schedule for later" to reveal the
  // time picker. The picker stays hidden by default so the "Send now"
  // path is one tap, no decision fatigue.
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  // Recipients (for the "specific" picker)
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  const [profileSearch, setProfileSearch] = useState("");
  // Type-filter drill-down on the Pick-specific picker — Gary's
  // directive (May 28): a manager should be able to narrow the
  // recipient list to e.g. all Sales Reps or all Owners without
  // scrolling 100+ people. Empty = no type filter (show everyone).
  // Value is role-prefixed ("manager:Owner" / "rep:Sales Rep") so a
  // name collision between the two vocabularies can't blur the
  // filter — same convention as /settings/managers.
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [repTypes, setRepTypes] = useState<RepTypeConfig[]>([]);
  const [managerTypes, setManagerTypes] = useState<ManagerTypeConfig[]>([]);
  // Target reps by the CUSTOMER region/group they serve (Gary, May 28
  // — "sending a message should let you select by group or region").
  // Messages go to users, so we resolve: customers in region/group →
  // their assigned reps → add those reps to the picked set. Needs the
  // customer roster (for region/group) + the rep↔customer assignment
  // map.
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [assignments, setAssignments] = useState<
    { rep_id: string; customer_id: string }[]
  >([]);
  // Region / group vocab from Site settings — the dropdown options.
  const [regionVocab, setRegionVocab] = useState<string[]>([]);
  const [groupVocab, setGroupVocab] = useState<string[]>([]);

  // Recent messages list
  const [recent, setRecent] = useState<MessageRow[]>([]);

  // Load profiles + type vocabularies + recent messages on mount;
  // subscribe to message changes so the recent list stays live.
  useEffect(() => {
    let cancelled = false;
    void listProfiles().then((ps) => {
      if (!cancelled) setAllProfiles(ps);
    });
    void Promise.all([getRepTypes(), getManagerTypes(), getRegions(), getGroups()]).then(
      ([r, m, rg, gr]) => {
        if (cancelled) return;
        setRepTypes(r);
        setManagerTypes(m);
        setRegionVocab(rg);
        setGroupVocab(gr);
      }
    );
    void Promise.all([listCustomers(), listAllAssignments()]).then(
      ([cs, as]) => {
        if (cancelled) return;
        setCustomers(cs);
        setAssignments(as);
      }
    );
    const loadRecent = () => {
      void listMessages({ limit: 25 }).then((rows) => {
        if (!cancelled) setRecent(rows);
      });
    };
    loadRecent();
    const unsub = subscribeMessages(loadRecent);
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  const filteredProfiles = useMemo(() => {
    let out = allProfiles;
    // Apply the type filter first — narrows the candidate set before
    // the free-text search runs.
    if (typeFilter) {
      const colon = typeFilter.indexOf(":");
      const wantRole = colon >= 0 ? typeFilter.slice(0, colon) : "";
      const wantName = (colon >= 0 ? typeFilter.slice(colon + 1) : typeFilter).toLowerCase();
      out = out.filter((p) => {
        if (wantRole === "manager") {
          return p.role === "manager" && (p.manager_type || "").toLowerCase() === wantName;
        }
        if (wantRole === "rep") {
          return p.role === "rep" && (p.rep_type || "").toLowerCase() === wantName;
        }
        return true;
      });
    }
    const q = profileSearch.trim().toLowerCase();
    if (q) {
      out = out.filter(
        (p) =>
          displayName(p).toLowerCase().includes(q) ||
          p.email.toLowerCase().includes(q)
      );
    }
    return out;
  }, [allProfiles, profileSearch, typeFilter]);

  const togglePicked = (id: string) => {
    setPickedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ── Target reps by the customers they serve (May 28) ────────────
  // Options come from the Site settings vocabulary (getRegions /
  // getGroups), NOT from distinct values on customer rows — so the
  // dropdown shows what the manager has actually defined, never a
  // stale legacy value (Gary, May 28). Picking one maps region|group
  // → matching customer IDs → assigned rep IDs → adds to the set.
  const customerRegionOptions = regionVocab;
  const customerGroupOptions = groupVocab;

  const addRepsServing = (predicate: (c: Customer) => boolean) => {
    const customerIds = new Set(
      customers.filter(predicate).map((c) => c.id)
    );
    const repIds = assignments
      .filter((a) => customerIds.has(a.customer_id))
      .map((a) => a.rep_id);
    if (repIds.length === 0) {
      setFlash(
        "No reps are assigned to customers in that region/group yet."
      );
      return;
    }
    setPickedIds((prev) => new Set([...prev, ...repIds]));
  };

  const audienceLabel = useMemo(() => {
    if (audienceKind === "all") return `Everyone (${allProfiles.length})`;
    if (audienceKind === "all_reps")
      return `All reps (${allProfiles.filter((p) => p.role === "rep").length})`;
    if (audienceKind === "all_managers")
      return `All managers (${
        allProfiles.filter((p) => p.role === "manager").length
      })`;
    return `${pickedIds.size} picked`;
  }, [audienceKind, allProfiles, pickedIds]);

  // Subject is the only required text field — message body is
  // optional now (May 14, Gary's feedback). Managers often want to
  // send a one-line "Pay slips are out" with no further detail and
  // the previous required-body rule was forcing them to repeat the
  // subject in the body just to clear validation.
  const canSend =
    subject.trim().length > 0 &&
    (deliverPush || deliverInApp) &&
    (audienceKind !== "specific" || pickedIds.size > 0) &&
    !busy;

  const onSend = async () => {
    if (!canSend) return;
    setError(null);
    setFlash(null);
    setBusy(true);

    // Parse the schedule input. Empty = send now. The
    // datetime-local input gives a string like "2026-05-14T09:00"
    // (LOCAL, no timezone). We treat it as local time and convert
    // to ISO.
    let scheduledAtIso: string | null = null;
    if (scheduledAtLocal.trim()) {
      const parsed = new Date(scheduledAtLocal);
      if (Number.isNaN(parsed.getTime())) {
        setBusy(false);
        setError("Couldn't parse the scheduled time.");
        return;
      }
      if (parsed.getTime() < Date.now() - 60_000) {
        setBusy(false);
        setError("Scheduled time is in the past — pick a future time, or clear to send now.");
        return;
      }
      scheduledAtIso = parsed.toISOString();
    }

    const r = await composeMessage({
      subject,
      body,
      audienceKind,
      audienceUserIds:
        audienceKind === "specific" ? Array.from(pickedIds) : undefined,
      deliverPush,
      deliverInApp,
      scheduledAtIso,
    });
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setFlash(
      scheduledAtIso
        ? `Scheduled for ${new Date(scheduledAtIso).toLocaleString()} — ${r.recipientCount} recipient${r.recipientCount === 1 ? "" : "s"}.`
        : `Sent to ${r.recipientCount} recipient${r.recipientCount === 1 ? "" : "s"}.`
    );
    setSubject("");
    setBody("");
    setScheduledAtLocal("");
    setScheduleOpen(false);
    setPickedIds(new Set());
  };

  const onCancelScheduled = async (m: MessageRow) => {
    if (!confirm(`Cancel scheduled message "${m.subject}"?`)) return;
    const r = await cancelMessage(m.id);
    if (!r.ok) alert(`Couldn't cancel: ${r.error}`);
  };

  return (
    <AdminShell breadcrumbs={["Home", "Messaging"]}>
      <div
        style={{
          padding: 20,
          display: "grid",
          gridTemplateColumns: "1fr 380px",
          gap: 16,
          alignItems: "start",
        }}
      >
        {/* ────────────── Composer ────────────── */}
        <Card padding={20}>
          <SectionTitle>New message</SectionTitle>

          {/* Audience */}
          <Field label="Audience" hint="Who gets this?">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {(
                [
                  ["all_reps", "All reps"],
                  ["all_managers", "All managers"],
                  ["all", "Everyone"],
                  ["specific", "Pick specific…"],
                ] as [AudienceKind, string][]
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setAudienceKind(k)}
                  style={{
                    padding: "7px 12px",
                    borderRadius: 999,
                    background:
                      audienceKind === k ? AC.brandDeep : "#fff",
                    color: audienceKind === k ? "#fff" : AC.ink,
                    border: `1px solid ${
                      audienceKind === k ? AC.brandDeep : AC.line
                    }`,
                    fontFamily: AC.font,
                    fontSize: 12.5,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <div
              style={{
                marginTop: 8,
                fontFamily: AC.font,
                fontSize: 12,
                color: AC.mute,
              }}
            >
              {audienceLabel}
            </div>
          </Field>

          {/* Specific-user picker — only when audienceKind = specific.
              Each row shows the rep/manager's avatar (their uploaded
              photo from mobile /profile, falling back to a coloured
              initials chip) so the manager picking the audience can
              actually recognise faces, not just match names. Dropdown
              is a static inline list (not a popover) so it doesn't
              accidentally close on outside taps — picking is via
              checkbox tick or full-row click. */}
          {audienceKind === "specific" && (
            <Field label="Pick users">
              {/* Type filter — narrows the user list by manager_type
                  or rep_type before the search runs. Region + Group
                  filters were added and removed same day (May 28):
                  those tags belong to customers, not users. Will
                  return as derived "users assigned to customers in
                  region X" filter in a follow-up. */}
              {(repTypes.length > 0 || managerTypes.length > 0) && (
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    marginBottom: 8,
                  }}
                >
                  <FilterSelect
                    value={typeFilter}
                    onChange={setTypeFilter}
                    allLabel="All types"
                    title="Narrow by manager or rep type"
                    groups={[
                      ...(managerTypes.length > 0
                        ? [
                            {
                              label: "Manager types",
                              options: managerTypes.map((t) => ({
                                value: `manager:${t.name}`,
                                label: t.name,
                              })),
                            },
                          ]
                        : []),
                      ...(repTypes.length > 0
                        ? [
                            {
                              label: "Rep types",
                              options: repTypes.map((t) => ({
                                value: `rep:${t.name}`,
                                label: t.name,
                              })),
                            },
                          ]
                        : []),
                    ]}
                  />
                  {typeFilter && filteredProfiles.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setPickedIds((prev) => {
                          const next = new Set(prev);
                          for (const p of filteredProfiles) next.add(p.id);
                          return next;
                        });
                      }}
                      title={`Add all ${filteredProfiles.length} matching users to the selection`}
                      style={{
                        padding: "8px 12px",
                        borderRadius: 8,
                        border: `1px solid ${AC.brand}`,
                        background: AC.brandSoft,
                        color: AC.brandDeep,
                        fontFamily: AC.font,
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      + Add all ({filteredProfiles.length})
                    </button>
                  )}
                </div>
              )}

              {/* Target reps by the CUSTOMER region/group they serve
                  (May 28). Picking one adds every rep assigned to a
                  customer in that region/group to the selection. Only
                  shows once customers carry regions/groups. */}
              {(customerRegionOptions.length > 0 ||
                customerGroupOptions.length > 0) && (
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    marginBottom: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <span
                    style={{
                      fontFamily: AC.font,
                      fontSize: 11,
                      color: AC.mute,
                      fontWeight: 600,
                    }}
                  >
                    Add reps serving:
                  </span>
                  {customerRegionOptions.length > 0 && (
                    <FilterSelect
                      value=""
                      onChange={(region) =>
                        region && addRepsServing((c) => c.region === region)
                      }
                      allLabel="Customer region…"
                      title="Add reps assigned to customers in a region"
                      options={customerRegionOptions.map((r) => ({
                        value: r,
                        label: r,
                      }))}
                    />
                  )}
                  {customerGroupOptions.length > 0 && (
                    <FilterSelect
                      value=""
                      onChange={(group) =>
                        group && addRepsServing((c) => c.customerGroup === group)
                      }
                      allLabel="Customer group…"
                      title="Add reps assigned to customers in a group"
                      options={customerGroupOptions.map((g) => ({
                        value: g,
                        label: g,
                      }))}
                    />
                  )}
                </div>
              )}

              <input
                value={profileSearch}
                onChange={(e) => setProfileSearch(e.target.value)}
                placeholder="Search by name or email…"
                style={inputStyle}
              />
              {pickedIds.size > 0 && (
                // Selected-summary strip lets the manager see WHO
                // they've already picked while scrolling a long list,
                // and clear all in one tap. Without this, a long
                // search query can scroll the picked rows out of view
                // and managers lose track of their selection.
                <div
                  style={{
                    marginTop: 8,
                    padding: "8px 10px",
                    background: AC.brandSoft,
                    border: `1px solid ${AC.brand}33`,
                    borderRadius: 8,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontFamily: AC.font,
                    fontSize: 12,
                    color: AC.brandDeep,
                    fontWeight: 600,
                  }}
                >
                  <span>
                    {pickedIds.size} picked
                  </span>
                  <div style={{ flex: 1 }} />
                  <button
                    type="button"
                    onClick={() => setPickedIds(new Set())}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: AC.brandDeep,
                      fontFamily: AC.font,
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    Clear
                  </button>
                </div>
              )}
              <div
                style={{
                  marginTop: 8,
                  maxHeight: 320,
                  overflowY: "auto",
                  border: `1px solid ${AC.line}`,
                  borderRadius: 10,
                  background: "#fff",
                }}
              >
                {filteredProfiles.length === 0 && (
                  <div
                    style={{
                      padding: "12px 14px",
                      fontFamily: AC.font,
                      fontSize: 12.5,
                      color: AC.mute,
                    }}
                  >
                    No matching users.
                  </div>
                )}
                {filteredProfiles.map((p) => {
                  const picked = pickedIds.has(p.id);
                  const initials =
                    initialsFromNameOrEmail(p.name, p.email) || "··";
                  return (
                    <label
                      key={p.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "10px 12px",
                        cursor: "pointer",
                        borderBottom: `1px solid ${AC.lineDim}`,
                        background: picked ? AC.brandSoft : "#fff",
                        transition: "background .12s",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={picked}
                        onChange={() => togglePicked(p.id)}
                        style={{
                          accentColor: AC.brand,
                          width: 16,
                          height: 16,
                          flexShrink: 0,
                        }}
                      />
                      <RepAvatar
                        rep={{ initials, avatarUrl: p.avatar_url }}
                        size={30}
                        seed={p.id}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontFamily: AC.font,
                            fontSize: 13,
                            fontWeight: 600,
                            color: AC.ink,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {displayName(p)}
                        </div>
                        <div
                          style={{
                            fontFamily: AC.font,
                            fontSize: 11.5,
                            color: AC.mute,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {p.email} · {p.role}
                          {/* Surface the user's type next to their
                              role — without this the manager has no
                              way to tell from the row alone whether
                              this person is an Owner vs Operations
                              manager, or a Sales Rep vs Merchandiser. */}
                          {p.role === "manager" && p.manager_type
                            ? ` · ${p.manager_type}`
                            : ""}
                          {p.role === "rep" && p.rep_type ? ` · ${p.rep_type}` : ""}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </Field>
          )}

          {/* Subject */}
          <Field label="Subject" required>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Pay slips are out"
              maxLength={120}
              style={inputStyle}
            />
          </Field>

          {/* Body — optional. Many messages are one-line ("Pay slips
              are out"). When the manager wants more detail this is
              where it goes. */}
          <Field label="Message" hint="Optional. Leave blank to send just the subject.">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              placeholder="Add detail here (optional)"
              style={{
                ...inputStyle,
                resize: "vertical",
                fontFamily: AC.font,
                minHeight: 90,
              }}
            />
          </Field>

          {/* Delivery channels */}
          <Field
            label="Send via"
            hint="Push fires even when the app is closed (good for urgent). In-app only shows while the rep is in the app (good for FYI / non-urgent). Pick at least one."
          >
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <ChannelToggle
                checked={deliverPush}
                onChange={setDeliverPush}
                title="Push notification"
                subtitle="OS-level. Pops on lock screen."
                glyph="send"
              />
              <ChannelToggle
                checked={deliverInApp}
                onChange={setDeliverInApp}
                title="In-app banner + inbox"
                subtitle="Quiet. Only seen while the rep is using the app."
                glyph="note"
              />
            </div>
          </Field>

          {/* Scheduling — only rendered when the manager taps the
              Schedule button below. Default flow is "Send now"; the
              picker is a deliberate detour, not always visible.
              Gary's feedback (May 14) was that reps were getting
              confused by the always-visible "When" field — was the
              field optional? required? what did blank mean? Hiding
              it by default until they explicitly choose to schedule
              removes that ambiguity. */}
          {scheduleOpen && (
            <Field
              label="Scheduled time"
              hint="Pick a future time. A cron sweep dispatches the message at that moment — keep the app, your laptop, nothing needs to be open."
            >
              <input
                type="datetime-local"
                value={scheduledAtLocal}
                onChange={(e) => setScheduledAtLocal(e.target.value)}
                style={inputStyle}
              />
            </Field>
          )}

          {error && (
            <div
              style={{
                padding: "10px 12px",
                background: AC.dangerTint,
                color: "#9c1a3c",
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 500,
                display: "flex",
                gap: 8,
                marginBottom: 12,
              }}
            >
              <AGlyph name="warn" size={14} color="#9c1a3c" />
              {error}
            </div>
          )}
          {flash && (
            <div
              style={{
                padding: "10px 12px",
                background: `${AC.brand}1A`,
                color: AC.brandDeep,
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 600,
                display: "flex",
                gap: 8,
                marginBottom: 12,
              }}
            >
              <AGlyph name="check" size={14} color={AC.brandDeep} />
              {flash}
            </div>
          )}

          {/* Send / schedule action row. Two explicit buttons by
              default ("Send now" + "Schedule for later"); tapping
              Schedule opens the time picker above and morphs this
              row into [Confirm schedule] + a Cancel link. Gary's
              feedback was that one flippy button + an always-
              visible time field made the schedule path unclear. */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            {scheduleOpen ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setScheduleOpen(false);
                    setScheduledAtLocal("");
                  }}
                  disabled={busy}
                  style={{
                    background: "transparent",
                    border: `1px solid ${AC.line}`,
                    color: AC.ink,
                    fontFamily: AC.font,
                    fontSize: 13,
                    fontWeight: 600,
                    padding: "8px 14px",
                    borderRadius: 8,
                    cursor: busy ? "not-allowed" : "pointer",
                  }}
                >
                  Cancel schedule
                </button>
                <Btn
                  kind="primary"
                  icon="clock"
                  onClick={onSend}
                  disabled={!canSend || !scheduledAtLocal.trim()}
                >
                  {busy ? "Scheduling…" : "Confirm schedule"}
                </Btn>
              </>
            ) : (
              <>
                <Btn
                  kind="secondary"
                  icon="clock"
                  onClick={() => setScheduleOpen(true)}
                  disabled={busy}
                >
                  Schedule for later
                </Btn>
                <Btn
                  kind="primary"
                  icon="send"
                  onClick={() => {
                    // Make sure no stale scheduled time leaks
                    // through when the manager skipped the
                    // schedule path — Send now should always
                    // ignore whatever was in the picker.
                    if (scheduledAtLocal) setScheduledAtLocal("");
                    onSend();
                  }}
                  disabled={!canSend}
                >
                  {busy ? "Sending…" : "Send now"}
                </Btn>
              </>
            )}
          </div>
        </Card>

        {/* ────────────── Recent + Scheduled ────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Card padding={16}>
            <div
              style={{
                fontFamily: AC.font,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 0.4,
                textTransform: "uppercase",
                color: AC.mute,
                marginBottom: 10,
              }}
            >
              Recent &amp; scheduled
            </div>
            {recent.length === 0 ? (
              <div
                style={{
                  fontFamily: AC.font,
                  fontSize: 12.5,
                  color: AC.mute,
                  padding: "8px 0",
                }}
              >
                No messages yet. Compose one to the left.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {recent.map((m) => (
                  <MessageListItem
                    key={m.id}
                    msg={m}
                    onCancel={() => onCancelScheduled(m)}
                  />
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </AdminShell>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────

function ChannelToggle({
  checked,
  onChange,
  title,
  subtitle,
  glyph,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  title: string;
  subtitle: string;
  glyph: "send" | "note";
}) {
  return (
    <label
      style={{
        flex: 1,
        minWidth: 220,
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "10px 12px",
        border: `1px solid ${checked ? AC.brand : AC.line}`,
        borderRadius: 12,
        background: checked ? AC.brandSoft : "#fff",
        cursor: "pointer",
        transition: "background .15s, border-color .15s",
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{
          width: 16,
          height: 16,
          marginTop: 2,
          accentColor: AC.brand,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontFamily: AC.font,
            fontSize: 13,
            fontWeight: 700,
            color: AC.ink,
          }}
        >
          <AGlyph name={glyph} size={13} color={AC.brandDeep} />
          {title}
        </div>
        <div
          style={{
            fontFamily: AC.font,
            fontSize: 11.5,
            color: AC.mute,
            marginTop: 2,
            lineHeight: 1.4,
          }}
        >
          {subtitle}
        </div>
      </div>
    </label>
  );
}

function MessageListItem({
  msg,
  onCancel,
}: {
  msg: MessageRow;
  onCancel: () => void;
}) {
  const isScheduled =
    msg.status === "pending" && msg.scheduled_at !== null;
  const isSent = msg.status === "sent";
  const isFailed = msg.status === "failed";
  const isCancelled = msg.status === "cancelled";
  const recipientCount =
    typeof msg.meta?.recipient_count === "number"
      ? (msg.meta.recipient_count as number)
      : null;
  return (
    <div
      style={{
        padding: 10,
        border: `1px solid ${AC.line}`,
        borderRadius: 10,
        background: "#fff",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 8,
          marginBottom: 4,
        }}
      >
        <div
          style={{
            flex: 1,
            minWidth: 0,
            fontFamily: AC.font,
            fontSize: 13,
            fontWeight: 700,
            color: AC.ink,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={msg.subject}
        >
          {msg.subject}
        </div>
        <StatusPill status={msg.status} />
      </div>
      <div
        style={{
          fontFamily: AC.font,
          fontSize: 11.5,
          color: AC.mute,
          lineHeight: 1.4,
          marginBottom: 6,
        }}
      >
        {audienceLabelFor(msg)}
        {recipientCount !== null && ` · ${recipientCount} recipient${recipientCount === 1 ? "" : "s"}`}
        {isScheduled &&
          msg.scheduled_at &&
          ` · scheduled ${new Date(msg.scheduled_at).toLocaleString()}`}
        {isSent &&
          msg.sent_at &&
          ` · sent ${new Date(msg.sent_at).toLocaleString()}`}
      </div>
      <div
        style={{
          fontFamily: AC.font,
          fontSize: 12,
          color: AC.ink2,
          lineHeight: 1.45,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {msg.body}
      </div>
      {(isFailed || isCancelled) && msg.meta?.send_error ? (
        <div
          style={{
            marginTop: 6,
            fontFamily: AC.font,
            fontSize: 11,
            color: "#9c1a3c",
          }}
        >
          {String(msg.meta.send_error)}
        </div>
      ) : null}
      {isScheduled && (
        <div style={{ marginTop: 8 }}>
          <Btn size="sm" onClick={onCancel}>
            Cancel scheduled send
          </Btn>
        </div>
      )}
    </div>
  );
}

function audienceLabelFor(m: MessageRow): string {
  if (m.audience_kind === "all") return "Everyone";
  if (m.audience_kind === "all_reps") return "All reps";
  if (m.audience_kind === "all_managers") return "All managers";
  const n = (m.audience_user_ids || []).length;
  return `${n} picked`;
}

function StatusPill({ status }: { status: MessageRow["status"] }) {
  const map: Record<MessageRow["status"], { label: string; bg: string; fg: string }> = {
    pending: { label: "Scheduled", bg: AC.warnTint, fg: "#7A560A" },
    sending: { label: "Sending…", bg: AC.brandSoft, fg: AC.brandDeep },
    sent: { label: "Sent", bg: `${AC.ok}1A`, fg: "#0d6a45" },
    failed: { label: "Failed", bg: AC.dangerTint, fg: "#9c1a3c" },
    cancelled: { label: "Cancelled", bg: AC.bg, fg: AC.mute },
  };
  const m = map[status];
  return (
    <span
      style={{
        padding: "2px 8px",
        borderRadius: 999,
        background: m.bg,
        color: m.fg,
        fontFamily: AC.font,
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: 0.3,
        textTransform: "uppercase",
        whiteSpace: "nowrap",
      }}
    >
      {m.label}
    </span>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          fontFamily: AC.font,
          fontSize: 11,
          color: AC.mute,
          fontWeight: 700,
          letterSpacing: 0.3,
          textTransform: "uppercase",
          marginBottom: 6,
        }}
      >
        {label}
        {required && <span style={{ color: AC.danger, marginLeft: 4 }}>*</span>}
      </div>
      {children}
      {hint && (
        <div
          style={{
            fontFamily: AC.font,
            fontSize: 11,
            color: AC.mute,
            marginTop: 4,
            lineHeight: 1.4,
          }}
        >
          {hint}
        </div>
      )}
    </div>
  );
}
