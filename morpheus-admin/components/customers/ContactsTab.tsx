"use client";

import { useEffect, useState } from "react";
import { Btn } from "@/components/ui/Btn";
import { Card } from "@/components/ui/Card";
import { AGlyph } from "@/components/ui/AGlyph";
import { EmptyState, TabLoading } from "@/components/ui/EmptyState";
import { TabHeader, TableColumnHeader } from "@/components/ui/TabHeader";
import { ExpandableRow, ExpandChevron } from "@/components/ui/ExpandableRow";
import { Pill } from "@/components/ui/Pill";
import { inputStyle } from "@/components/ui/Filters";
import { AC } from "@/lib/tokens";
import {
  listCustomerContacts,
  createContact,
  updateContact,
  removeContact,
  setPrimaryContact,
  type CustomerContact,
  type ContactPatch,
} from "@/lib/customer-contacts-store";
import { iconBtn } from "./tabStyles";

// Contact rows / column header use a single grid template:
//   Name (+ optional role pill + notes one-liner) | Phone | Email | actions
// Slight extra weight on Name so a long display name + role pill don't
// crowd the phone column.
// Last column widened from 60px → 96px May 28 to fit the new
// "set primary" star alongside edit + delete (Rayhaan R7).
const CONTACT_COLS = "1.6fr 1.2fr 1.4fr 96px";

/**
 * Customer contacts — inline CRUD. "Add contact" opens an inline form
 * below the header; each row exposes pencil (expand to edit) and trash
 * (confirm + soft-delete) on the right. Mirrors the Sites tab's
 * inline-form pattern so the two sub-entities feel the same.
 */
export function ContactsTab({ customerId }: { customerId: string }) {
  const [contacts, setContacts] = useState<CustomerContact[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Single-at-a-time accordion: clicking another row collapses the
  // previous one. Only contacts WITH notes are expandable — no point
  // expanding to reveal an empty panel.
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const reload = () =>
    listCustomerContacts(customerId).then((rows) => {
      setContacts(rows);
    });

  useEffect(() => {
    let cancelled = false;
    // Reset loading on customerId change so the spinner returns when
    // the user navigates between customers without unmounting the tab.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    listCustomerContacts(customerId)
      .then((rows) => {
        if (!cancelled) setContacts(rows);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  async function onSaveNew(values: ContactPatch) {
    if (!values.name || !values.name.trim()) return;
    const r = await createContact({
      customer_id: customerId,
      name: values.name.trim(),
      role_label: values.role_label ?? null,
      phone: values.phone ?? null,
      email: values.email ?? null,
      notes: values.notes ?? null,
    });
    if (!r.ok) {
      // Raw Postgres / RLS messages can leak schema hints. Log them
      // for the developer in the console and show a generic toast
      // to the user.
      console.warn("[contacts] create failed:", r.error);
      alert("Couldn't add contact — please retry.");
      return;
    }
    setAdding(false);
    await reload();
  }

  async function onSaveEdit(id: string, values: ContactPatch) {
    const r = await updateContact(id, values);
    if (!r.ok) {
      console.warn("[contacts] update failed:", r.error);
      alert("Couldn't update contact — please retry.");
      return;
    }
    setEditingId(null);
    await reload();
  }

  // Toggle the primary (headline) contact. Clicking the star on the
  // current primary clears it; clicking another sets it (the store
  // helper clears the previous one). The Overview hero reads this.
  // Rayhaan R7, May 28.
  async function onTogglePrimary(c: CustomerContact) {
    setBusyId(c.id);
    const r = await setPrimaryContact(customerId, c.is_primary ? null : c.id);
    setBusyId(null);
    if (!r.ok) {
      console.warn("[contacts] set-primary failed:", r.error);
      alert("Couldn't update the primary contact — please retry.");
      return;
    }
    await reload();
  }

  async function onDelete(c: CustomerContact) {
    if (!confirm(`Delete contact "${c.name}"?`)) return;
    setBusyId(c.id);
    const r = await removeContact(c.id);
    setBusyId(null);
    if (!r.ok) {
      console.warn("[contacts] delete failed:", r.error);
      alert("Couldn't delete contact — please retry.");
      return;
    }
    await reload();
  }

  const count = contacts?.length ?? 0;

  return (
    <Card padding={0}>
      <TabHeader
        title="Contacts at this customer"
        count={count}
        action={
          !adding && count > 0 ? (
            <Btn
              size="sm"
              kind="primary"
              icon="plus"
              onClick={() => {
                setEditingId(null);
                setAdding(true);
              }}
            >
              Add contact
            </Btn>
          ) : null
        }
      />

      {adding && (
        <ContactForm
          onCancel={() => setAdding(false)}
          onSave={onSaveNew}
          submitLabel="Add contact"
        />
      )}

      {loading ? (
        <TabLoading label="Loading contacts…" />
      ) : !adding && count === 0 ? (
        <EmptyState
          icon="reps"
          title="No contacts on file yet"
          hint="Add the customer's primary contact so reps know who to call on site."
          actionLabel="Add contact"
          onAction={() => setAdding(true)}
        />
      ) : (
        <div>
          {count > 0 && (
            <TableColumnHeader columns={CONTACT_COLS} borderTop={adding}>
              <div>Name</div>
              <div>Phone</div>
              <div>Email</div>
              <div />
            </TableColumnHeader>
          )}
          {(contacts ?? []).map((c, i) => {
            if (editingId === c.id) {
              return (
                <ContactForm
                  key={c.id}
                  initial={c}
                  onCancel={() => setEditingId(null)}
                  onSave={(values) => onSaveEdit(c.id, values)}
                  submitLabel="Save"
                />
              );
            }
            const expandable = !!c.notes;
            const expanded = expandable && expandedId === c.id;
            return (
              <ExpandableRow
                key={c.id}
                expanded={expanded}
                onToggle={() => setExpandedId(expanded ? null : c.id)}
                expandable={expandable}
                isLast={i === count - 1}
                columns={CONTACT_COLS}
                panel={
                  c.notes ? (
                    <div
                      style={{
                        padding: "0 16px 14px",
                        fontFamily: AC.font,
                        fontSize: 12.5,
                        color: AC.ink2,
                        lineHeight: 1.5,
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: 0.4,
                          textTransform: "uppercase",
                          color: AC.mute,
                          marginBottom: 4,
                        }}
                      >
                        Notes
                      </div>
                      {c.notes}
                    </div>
                  ) : null
                }
              >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        flexWrap: "wrap",
                      }}
                    >
                      <span
                        style={{
                          fontFamily: AC.font,
                          fontSize: 13,
                          fontWeight: 700,
                          color: AC.ink,
                          letterSpacing: -0.1,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {c.name}
                      </span>
                      {c.is_primary && (
                        <Pill bg={AC.brandSoft} fg={AC.brandInk}>
                          ★ Primary
                        </Pill>
                      )}
                      {c.role_label && <Pill variant="outline">{c.role_label}</Pill>}
                      {expandable && <ExpandChevron expanded={expanded} />}
                    </div>
                    {c.notes && !expanded && (
                      <div
                        style={{
                          marginTop: 3,
                          fontFamily: AC.font,
                          fontSize: 11.5,
                          color: AC.mute,
                          lineHeight: 1.4,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {c.notes}
                      </div>
                    )}
                  </div>
                  <div style={{ fontFamily: AC.font, fontSize: 12.5, minWidth: 0 }}>
                    {c.phone ? (
                      <a
                        href={`tel:${c.phone}`}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          color: AC.brandDeep,
                          textDecoration: "none",
                          fontWeight: 600,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {c.phone}
                      </a>
                    ) : (
                      <span style={{ color: AC.faint }}>—</span>
                    )}
                  </div>
                  <div
                    style={{
                      fontFamily: AC.font,
                      fontSize: 12.5,
                      minWidth: 0,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {c.email ? (
                      <a
                        href={`mailto:${c.email}`}
                        onClick={(e) => e.stopPropagation()}
                        style={{ color: AC.brandDeep, textDecoration: "none" }}
                        title={c.email}
                      >
                        {c.email}
                      </a>
                    ) : (
                      <span style={{ color: AC.faint }}>—</span>
                    )}
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 4 }}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onTogglePrimary(c);
                      }}
                      disabled={busyId === c.id}
                      title={
                        c.is_primary
                          ? "Remove as primary contact"
                          : "Set as primary contact (shows on the customer hero)"
                      }
                      style={{
                        ...iconBtn,
                        color: c.is_primary ? AC.brandDeep : AC.mute,
                        cursor: busyId === c.id ? "not-allowed" : "pointer",
                        opacity: busyId === c.id ? 0.4 : 1,
                      }}
                    >
                      {/* Filled-feel star when primary, outline pin otherwise.
                          No dedicated star glyph in the registry, so use
                          a literal ★ / ☆ for clarity. */}
                      <span
                        style={{
                          fontSize: 15,
                          lineHeight: 1,
                          color: c.is_primary ? AC.brandDeep : AC.hint,
                        }}
                      >
                        {c.is_primary ? "★" : "☆"}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setAdding(false);
                        setEditingId(c.id);
                      }}
                      title="Edit contact"
                      style={iconBtn}
                    >
                      <AGlyph name="edit" size={14} color={AC.mute} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(c);
                      }}
                      disabled={busyId === c.id}
                      title="Delete contact"
                      style={{
                        ...iconBtn,
                        cursor: busyId === c.id ? "not-allowed" : "pointer",
                        opacity: busyId === c.id ? 0.4 : 1,
                      }}
                    >
                      <AGlyph name="trash" size={14} color={AC.mute} />
                    </button>
                  </div>
              </ExpandableRow>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function ContactForm({
  initial,
  onCancel,
  onSave,
  submitLabel,
}: {
  initial?: CustomerContact;
  onCancel: () => void;
  onSave: (values: ContactPatch) => Promise<void>;
  submitLabel: string;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [role, setRole] = useState(initial?.role_label ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        role_label: role.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        notes: notes.trim() || null,
      });
    } finally {
      // Always clear `saving` even if onSave throws (network drop,
      // unhandled exception) so the form isn't stuck on "Saving…".
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        padding: 16,
        background: AC.bgDeep,
        borderBottom: `1px solid ${AC.line}`,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
        }}
      >
        <FormField label="Name *">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jane Smith"
            style={inputStyle}
            autoFocus
          />
        </FormField>
        <FormField label="Role">
          <input
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="Ops lead, Accounts, Security…"
            style={inputStyle}
          />
        </FormField>
        <FormField label="Phone">
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+27 21 555 0123"
            style={inputStyle}
          />
        </FormField>
        <FormField label="Email">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jane@example.com"
            style={inputStyle}
          />
        </FormField>
      </div>
      <div style={{ marginTop: 12 }}>
        <FormField label="Notes">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything reps should know about this contact…"
            rows={2}
            style={{ ...inputStyle, resize: "vertical", fontFamily: AC.font }}
          />
        </FormField>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
        <Btn size="sm" onClick={onCancel} disabled={saving}>
          Cancel
        </Btn>
        <Btn
          size="sm"
          kind="primary"
          onClick={submit}
          disabled={!name.trim() || saving}
        >
          {saving ? "Saving…" : submitLabel}
        </Btn>
      </div>
    </div>
  );
}

function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
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
      </div>
      {children}
    </div>
  );
}
