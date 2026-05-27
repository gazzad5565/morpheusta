"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Btn } from "@/components/ui/Btn";
import { Card } from "@/components/ui/Card";
import { AGlyph } from "@/components/ui/AGlyph";
import { AC } from "@/lib/tokens";
import type { Customer } from "@/lib/types";
import {
  listCustomerContacts,
  type CustomerContact,
} from "@/lib/customer-contacts-store";

// MapLibre needs `window`; client-only.
const AddressMap = dynamic(
  () => import("@/components/CustomerAddressMap").then((m) => m.CustomerAddressMap),
  { ssr: false }
);

// Maximum contacts to surface inline on Overview before collapsing
// the rest behind a "View all in Contacts tab" hint. 3 keeps the
// card compact; the full list is one click away on the Contacts tab.
const OVERVIEW_CONTACT_LIMIT = 3;

/**
 * Location on Overview reads directly from the customer row (address /
 * latitude / longitude / geofence — set on /customers/[id]/edit → Location).
 * The Sites tab manages additional locations the customer operates from;
 * those are not surfaced here.
 *
 * Contacts surfaced inline (May 27) — Gary's feedback: a manager opening
 * a customer should see the contact info + address by default without
 * clicking into sub-tabs. Up to 3 active contacts shown with clickable
 * mailto: email + tel: phone; "+N more" link kicks them to Contacts tab.
 * Address gets a "Open in Maps" affordance.
 */
export function OverviewTab({
  customer,
  stats,
}: {
  customer: Customer;
  stats: {
    repsAssigned: number;
    tasks: number;
    files: number;
    shiftsToday: number;
  };
}) {
  const router = useRouter();
  const goEdit = () => router.push(`/customers/${customer.id}/edit`);

  const hasCoords =
    customer.latitude != null && customer.longitude != null;

  // Contacts fetched inline (mirrors ContactsTab's customerId-only
  // interface — no parent-level state changes needed for this addition).
  const [contacts, setContacts] = useState<CustomerContact[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    // listCustomerContacts already filters to active=true; no extra param.
    listCustomerContacts(customer.id).then((rows) => {
      if (cancelled) return;
      setContacts(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [customer.id]);

  const visibleContacts = (contacts ?? []).slice(0, OVERVIEW_CONTACT_LIMIT);
  const remainingContactCount = Math.max(
    0,
    (contacts?.length ?? 0) - OVERVIEW_CONTACT_LIMIT
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <Stat label="Reps assigned" value={stats.repsAssigned} />
        <Stat label="Tasks defined" value={stats.tasks} />
        <Stat label="Library files" value={stats.files} />
        <Stat label="Shifts today" value={stats.shiftsToday} />
      </div>

      {/* Contacts card — shown by default so a manager doesn't have
          to click into the Contacts tab just to read an email or
          phone number. Empty state stays useful (links to Contacts
          tab to add the first one). */}
      <Card padding={0}>
        <div
          style={{
            padding: "14px 16px",
            borderBottom: `1px solid ${AC.lineDim}`,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span
            style={{
              fontFamily: AC.font,
              fontSize: 11,
              fontWeight: 700,
              color: AC.mute,
              letterSpacing: 0.4,
              textTransform: "uppercase",
            }}
          >
            Contacts
          </span>
          <div style={{ flex: 1 }} />
          {contacts && contacts.length === 0 && (
            <span
              style={{
                fontFamily: AC.font,
                fontSize: 12,
                color: AC.mute,
              }}
            >
              None yet — open the Contacts tab to add the first one.
            </span>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {contacts === null ? (
            <div
              style={{
                padding: "18px 16px",
                fontFamily: AC.font,
                fontSize: 12.5,
                color: AC.mute,
              }}
            >
              Loading contacts…
            </div>
          ) : (
            visibleContacts.map((c, i) => (
              <ContactRow
                key={c.id}
                contact={c}
                isLast={i === visibleContacts.length - 1 && remainingContactCount === 0}
              />
            ))
          )}
          {remainingContactCount > 0 && (
            <div
              style={{
                padding: "10px 16px",
                fontFamily: AC.font,
                fontSize: 12,
                color: AC.mute,
              }}
            >
              + {remainingContactCount} more · open the{" "}
              <b style={{ color: AC.ink2 }}>Contacts</b> tab for the full list.
            </div>
          )}
        </div>
      </Card>

      <Card padding={0}>
        <div
          style={{
            padding: "14px 16px",
            borderBottom: `1px solid ${AC.lineDim}`,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span
            style={{
              fontFamily: AC.font,
              fontSize: 11,
              fontWeight: 700,
              color: AC.mute,
              letterSpacing: 0.4,
              textTransform: "uppercase",
            }}
          >
            Location
          </span>
          <div style={{ flex: 1 }} />
          <Btn size="sm" icon="edit" onClick={goEdit}>
            Edit
          </Btn>
        </div>

        <div style={{ overflow: "hidden" }}>
          {hasCoords ? (
            <AddressMap
              lat={customer.latitude!}
              lng={customer.longitude!}
              radiusM={customer.geofence ?? 100}
              color={customer.color}
              initials={customer.initials}
              height={220}
            />
          ) : (
            <div
              style={{
                height: 220,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "column",
                fontFamily: AC.font,
                color: AC.mute,
                fontSize: 13,
                gap: 8,
                background: "#F1F4F7",
              }}
            >
              <AGlyph name="pin" size={26} color={AC.faint} />
              <div>No coordinates yet</div>
              <Btn size="sm" icon="edit" onClick={goEdit}>
                Add an address
              </Btn>
            </div>
          )}
        </div>

        <div style={{ padding: "12px 16px 16px" }}>
          <div
            style={{
              fontFamily: AC.font,
              fontSize: 13.5,
              color: AC.ink,
              fontWeight: 600,
              lineHeight: 1.45,
            }}
          >
            {customer.address ? (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(customer.address)}`}
                target="_blank"
                rel="noreferrer noopener"
                title="Open in Google Maps"
                style={{
                  color: AC.ink,
                  textDecoration: "none",
                  borderBottom: `1px dotted ${AC.line}`,
                }}
              >
                {customer.address}
              </a>
            ) : hasCoords ? (
              <span style={{ fontWeight: 500, color: AC.mute, fontStyle: "italic" }}>
                Pinned location · no street address on file
              </span>
            ) : (
              <span style={{ fontWeight: 500, color: AC.mute, fontStyle: "italic" }}>
                No address yet — open Edit to add one.
              </span>
            )}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginTop: 8,
              fontFamily: AC.font,
              fontSize: 11.5,
              color: AC.mute,
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <AGlyph name="pin" size={11} color={AC.mute} />
              Geofence · {customer.geofence ?? 100} m
            </span>
            {hasCoords && (
              <span style={{ fontFamily: AC.fontMono }}>
                {customer.latitude!.toFixed(4)}, {customer.longitude!.toFixed(4)}
              </span>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

/**
 * Single contact row — name + role on the left, mailto:/tel: links
 * on the right. Designed to look at home in the same card as Location
 * (compact, low ceremony). Renders nothing for fields the contact
 * doesn't have — never shows an empty pill.
 */
function ContactRow({
  contact,
  isLast,
}: {
  contact: CustomerContact;
  isLast: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "10px 16px",
        borderBottom: isLast ? "none" : `1px solid ${AC.lineDim}`,
        flexWrap: "wrap",
      }}
    >
      <div style={{ flex: "1 1 200px", minWidth: 0 }}>
        <div
          style={{
            fontFamily: AC.font,
            fontSize: 13,
            fontWeight: 600,
            color: AC.ink,
            letterSpacing: -0.1,
          }}
        >
          {contact.name}
        </div>
        {contact.role_label && (
          <div
            style={{
              fontFamily: AC.font,
              fontSize: 11.5,
              color: AC.mute,
              marginTop: 2,
            }}
          >
            {contact.role_label}
          </div>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        {contact.email && (
          <a
            href={`mailto:${contact.email}`}
            style={contactLinkStyle}
            title={`Email ${contact.name}`}
          >
            <AGlyph name="mail" size={12} color={AC.brandDeep} />
            <span style={{ wordBreak: "break-all" }}>{contact.email}</span>
          </a>
        )}
        {contact.phone && (
          <a
            href={`tel:${contact.phone.replace(/\s+/g, "")}`}
            style={contactLinkStyle}
            title={`Call ${contact.name}`}
          >
            <AGlyph name="phone" size={12} color={AC.brandDeep} />
            <span>{contact.phone}</span>
          </a>
        )}
      </div>
    </div>
  );
}

const contactLinkStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  fontFamily: AC.font,
  fontSize: 12.5,
  color: AC.brandInk,
  textDecoration: "none",
  fontWeight: 500,
};

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div
      style={{
        padding: "14px 16px",
        borderRadius: AC.radiusCard,
        background: AC.card,
        border: `1px solid ${AC.line}`,
      }}
    >
      <div
        style={{
          fontFamily: AC.font,
          fontSize: 11,
          color: AC.mute,
          fontWeight: 600,
          letterSpacing: 0.3,
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: AC.font,
          fontSize: 22,
          fontWeight: 700,
          color: AC.ink,
          letterSpacing: -0.6,
          marginTop: 4,
        }}
      >
        {value}
      </div>
    </div>
  );
}
