"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import { Btn } from "@/components/ui/Btn";
import { Card } from "@/components/ui/Card";
import { AGlyph } from "@/components/ui/AGlyph";
import { Spinner } from "@/components/ui/LoadingBar";
import { AC } from "@/lib/tokens";
import type { CustomerSite } from "@/lib/sites-store";
import type { Customer } from "@/lib/types";

// MapLibre needs `window`; client-only.
const AddressMap = dynamic(
  () => import("@/components/CustomerAddressMap").then((m) => m.CustomerAddressMap),
  { ssr: false }
);

export function OverviewTab({
  customer,
  sites,
  stats,
  onJumpToSites,
}: {
  customer: Customer;
  // Sites for the head-office card. Owned by the parent so OverviewTab
  // and SitesTab share one fetch. `null` while the initial load is in
  // flight; `[]` once we know the customer has no sites.
  sites: CustomerSite[] | null;
  stats: {
    repsAssigned: number;
    tasks: number;
    files: number;
    shiftsToday: number;
  };
  onJumpToSites: () => void;
}) {
  // Head office = first active site in the array. Relies on
  // listSitesForCustomer ordering by created_at ASC (sites-store.ts) so
  // the same site is picked across renders. If that ordering ever
  // changes, this card would flip between sites on reload — keep them
  // in sync.
  const headOffice = useMemo(
    () => (sites ?? []).find((s) => s.active) ?? null,
    [sites]
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* KPI strip — 4 stats across, full width. Replaces the prior
          1fr-1fr Quick-summary-vs-Head-office grid which gave the
          two cards mismatched heights (the right card carried a 220
          px map + meta + optional contact block, dwarfing the left).
          Stacked stats-on-top mirrors the Live Ops dashboard pattern
          and lets the head-office card breathe at full width below. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <Stat label="Reps assigned" value={stats.repsAssigned} />
        <Stat label="Tasks defined" value={stats.tasks} />
        <Stat label="Library files" value={stats.files} />
        <Stat label="Shifts today" value={stats.shiftsToday} />
      </div>

      {/* Head office card — the customer's primary location.
          Map + geofence circle render by default. Click the address
          chip or the action button to jump straight to the Sites tab. */}
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
              Head office
            </span>
            <div style={{ flex: 1 }} />
            <Btn size="sm" icon="settings" onClick={onJumpToSites}>
              {sites && sites.length > 1
                ? `Manage ${sites.filter((s) => s.active).length} sites`
                : "Edit"}
            </Btn>
          </div>

          {sites === null ? (
            <div
              style={{
                height: 240,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                color: AC.mute,
                fontFamily: AC.font,
                fontSize: 12.5,
              }}
            >
              <Spinner size={14} /> Loading head office…
            </div>
          ) : headOffice ? (
            <>
              <div style={{ overflow: "hidden" }}>
                {headOffice.latitude != null && headOffice.longitude != null ? (
                  <AddressMap
                    lat={headOffice.latitude}
                    lng={headOffice.longitude}
                    radiusM={headOffice.geofence_radius_m ?? 100}
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
                    <Btn size="sm" icon="edit" onClick={onJumpToSites}>
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
                  {/* Three-way fallback so a rep-geocoded site (which
                      has coords + a site name + a synthesised
                      address line, but no proper street address)
                      shows something meaningful here instead of the
                      "no address yet" string. Order of preference:
                        1. Real street address if set.
                        2. The site's own `name` if it's been
                           customised (i.e. not still "Main").
                        3. Coords-only fallback so reps + managers
                           can see a pin exists.
                        4. Final "no address" empty state. */}
                  {headOffice.address ? (
                    headOffice.address
                  ) : headOffice.name && headOffice.name !== "Main" ? (
                    <span>
                      {headOffice.name}
                      <span
                        style={{
                          fontWeight: 500,
                          color: AC.mute,
                          fontStyle: "italic",
                          marginLeft: 6,
                        }}
                      >
                        · no street address on file
                      </span>
                    </span>
                  ) : headOffice.latitude != null &&
                    headOffice.longitude != null ? (
                    <span style={{ fontWeight: 500, color: AC.mute, fontStyle: "italic" }}>
                      Pinned location · no street address on file
                    </span>
                  ) : (
                    <span style={{ fontWeight: 500, color: AC.mute, fontStyle: "italic" }}>
                      No address yet — open Sites to add one.
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
                    Geofence · {headOffice.geofence_radius_m ?? 100} m
                  </span>
                  {headOffice.latitude != null && headOffice.longitude != null && (
                    <span style={{ fontFamily: AC.fontMono }}>
                      {headOffice.latitude.toFixed(4)}, {headOffice.longitude.toFixed(4)}
                    </span>
                  )}
                </div>

                {/* Contact block — only renders the lines that exist.
                    Phone + email are tap targets. */}
                {(headOffice.contact_name ||
                  headOffice.contact_phone ||
                  headOffice.contact_email) && (
                  <div
                    style={{
                      marginTop: 10,
                      padding: "8px 10px",
                      background: AC.bg,
                      borderRadius: 8,
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      fontFamily: AC.font,
                      fontSize: 12.5,
                      color: AC.ink2,
                    }}
                  >
                    {headOffice.contact_name && (
                      <div style={{ fontWeight: 600, color: AC.ink }}>
                        {headOffice.contact_name}
                      </div>
                    )}
                    {headOffice.contact_phone && (
                      <a
                        href={`tel:${headOffice.contact_phone}`}
                        style={{ color: AC.brandDeep, textDecoration: "none" }}
                      >
                        {headOffice.contact_phone}
                      </a>
                    )}
                    {headOffice.contact_email && (
                      <a
                        href={`mailto:${headOffice.contact_email}`}
                        style={{ color: AC.brandDeep, textDecoration: "none" }}
                      >
                        {headOffice.contact_email}
                      </a>
                    )}
                  </div>
                )}
                {headOffice.notes && (
                  <div
                    style={{
                      marginTop: 8,
                      padding: "8px 10px",
                      background: AC.warnTint,
                      borderRadius: 8,
                      fontFamily: AC.font,
                      fontSize: 12,
                      color: "#6d4808",
                      lineHeight: 1.45,
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: 0.4,
                        textTransform: "uppercase",
                        marginBottom: 4,
                        color: "#7d5708",
                      }}
                    >
                      Access notes
                    </div>
                    {headOffice.notes}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div
              style={{
                padding: 24,
                textAlign: "center",
                fontFamily: AC.font,
                fontSize: 13,
                color: AC.mute,
              }}
            >
              No sites yet.
              <div style={{ marginTop: 10 }}>
                <Btn size="sm" icon="plus" kind="primary" onClick={onJumpToSites}>
                  Add head office
                </Btn>
              </div>
            </div>
          )}
        </Card>
    </div>
  );
}

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
