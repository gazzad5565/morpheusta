"use client";

/**
 * One row in the SitesTab table. Collapsed by default; expanding reveals
 * a map preview, optional contact block, and a deactivate/reactivate
 * toggle. Pencil / trash icons sit at the right edge of the row.
 *
 * Lives in its own file (split out of SitesTab in May 2026) because the
 * row carries enough internal logic — confirm dialogs, a busy flag, the
 * expanded panel — that bundling it inline pushed SitesTab past 575
 * lines.
 */

import { useState } from "react";
import dynamic from "next/dynamic";
import { Btn } from "@/components/ui/Btn";
import { AGlyph } from "@/components/ui/AGlyph";
import { ExpandableRow, ExpandChevron } from "@/components/ui/ExpandableRow";
import { Pill } from "@/components/ui/Pill";
import { iconBtn } from "./tabStyles";
import { DEFAULT_GEOFENCE_M } from "./SiteEditor";
import { AC } from "@/lib/tokens";
import {
  deactivateSite,
  reactivateSite,
  deleteSite,
  type CustomerSite,
} from "@/lib/sites-store";
import type { Customer } from "@/lib/types";

const AddressMap = dynamic(
  () => import("@/components/CustomerAddressMap").then((m) => m.CustomerAddressMap),
  { ssr: false }
);

// Grid template shared with the SitesTab column header so the two stay
// aligned. Name (+ optional inactive badge) | Address | Geofence | Actions.
export const SITE_COLS = "1fr 3fr 110px 60px";

export function SiteRow({
  site,
  customer,
  isLast,
  expanded,
  onToggleExpand,
  onEdit,
  onChanged,
}: {
  site: CustomerSite;
  customer: Customer;
  isLast: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const hasCoords = site.latitude != null && site.longitude != null;
  const radius = site.geofence_radius_m ?? DEFAULT_GEOFENCE_M;

  async function onToggleActive() {
    setBusy(true);
    if (site.active) {
      await deactivateSite(site.id);
    } else {
      await reactivateSite(site.id);
    }
    setBusy(false);
    await onChanged();
  }

  async function onDelete() {
    if (
      !confirm(
        `Delete site "${site.name}"?\n\nThis is a hard delete. If any shifts are attached, the operation will fail and you'll need to deactivate the site instead.`
      )
    ) {
      return;
    }
    setBusy(true);
    const r = await deleteSite(site.id);
    setBusy(false);
    if (!r.ok) {
      // Raw Postgres / RLS / FK-violation messages can leak schema
      // hints. Log the detail for the developer and show the manager
      // a message that explains the most common cause (shifts attached
      // → use deactivate instead).
      console.warn("[sites] delete failed:", r.error);
      alert(
        "Couldn't delete this site. If shifts are attached, deactivate it instead."
      );
      return;
    }
    await onChanged();
  }

  const panel = expanded ? (
    <div
      style={{
        padding: "0 16px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      {/* Map hero — full width across the row so the geofence circle
          gets the horizontal space it deserves. */}
      <div
        style={{
          borderRadius: 10,
          overflow: "hidden",
          border: `1px solid ${AC.line}`,
          background: "#F1F4F7",
        }}
      >
        {hasCoords ? (
          <AddressMap
            lat={site.latitude!}
            lng={site.longitude!}
            radiusM={radius}
            color={customer.color}
            initials={customer.initials}
            height={240}
          />
        ) : (
          <div
            style={{
              height: 240,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "column",
              fontFamily: AC.font,
              color: AC.mute,
              fontSize: 12,
              gap: 6,
            }}
          >
            <AGlyph name="pin" size={22} color={AC.faint} />
            <div>No coordinates yet</div>
          </div>
        )}
      </div>

      {hasCoords && (
        <div
          style={{
            fontFamily: AC.fontMono,
            fontSize: 11,
            color: AC.mute,
          }}
        >
          {site.latitude!.toFixed(5)}, {site.longitude!.toFixed(5)}
        </div>
      )}

      {/* Contact + notes side-by-side when both exist; either
          expands to full width when alone. */}
      {(site.contact_name ||
        site.contact_phone ||
        site.contact_email ||
        site.notes) && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              (site.contact_name || site.contact_phone || site.contact_email) &&
              site.notes
                ? "1fr 1fr"
                : "1fr",
            gap: 12,
            alignItems: "start",
          }}
        >
          {(site.contact_name || site.contact_phone || site.contact_email) && (
            <div
              style={{
                padding: "10px 12px",
                background: "#fff",
                border: `1px solid ${AC.line}`,
                borderRadius: 10,
                display: "flex",
                flexDirection: "column",
                gap: 4,
                fontFamily: AC.font,
                fontSize: 12.5,
                color: AC.ink2,
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: 0.4,
                  textTransform: "uppercase",
                  color: AC.mute,
                  marginBottom: 2,
                }}
              >
                On-site contact
              </div>
              {site.contact_name && (
                <div style={{ fontWeight: 600, color: AC.ink }}>
                  {site.contact_name}
                </div>
              )}
              {site.contact_phone && (
                <a
                  href={`tel:${site.contact_phone}`}
                  style={{
                    color: AC.brandDeep,
                    textDecoration: "none",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <AGlyph name="phone" size={11} color={AC.brandDeep} />
                  {site.contact_phone}
                </a>
              )}
              {site.contact_email && (
                <a
                  href={`mailto:${site.contact_email}`}
                  style={{
                    color: AC.brandDeep,
                    textDecoration: "none",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <AGlyph name="mail" size={11} color={AC.brandDeep} />
                  {site.contact_email}
                </a>
              )}
            </div>
          )}

          {site.notes && (
            <div
              style={{
                padding: "10px 12px",
                background: AC.warnTint,
                borderRadius: 10,
                fontFamily: AC.font,
                fontSize: 12.5,
                color: "#6d4808",
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
                  marginBottom: 4,
                  color: "#7d5708",
                }}
              >
                Access notes
              </div>
              {site.notes}
            </div>
          )}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Btn size="sm" onClick={onToggleActive} disabled={busy}>
          {site.active ? "Deactivate" : "Reactivate"}
        </Btn>
      </div>
    </div>
  ) : null;

  return (
    <ExpandableRow
      expanded={expanded}
      onToggle={onToggleExpand}
      isLast={isLast}
      columns={SITE_COLS}
      opacity={site.active ? 1 : 0.65}
      panel={panel}
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
            {site.name}
          </span>
          {!site.active && (
            <Pill variant="outline" uppercase style={{ fontSize: 10, fontWeight: 700 }}>
              Inactive
            </Pill>
          )}
          <ExpandChevron expanded={expanded} />
        </div>
      </div>
      <div
        style={{
          fontFamily: AC.font,
          fontSize: 12.5,
          color: site.address ? AC.ink2 : AC.faint,
          fontStyle: site.address ? "normal" : "italic",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          minWidth: 0,
        }}
        title={site.address ?? undefined}
      >
        {site.address || "No address yet"}
      </div>
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontFamily: AC.font,
          fontSize: 12,
          color: AC.ink2,
        }}
      >
        <AGlyph name="pin" size={11} color={AC.mute} />
        {radius} m
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 4 }}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          disabled={busy}
          title="Edit site"
          style={iconBtn}
        >
          <AGlyph name="edit" size={14} color={AC.mute} />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          disabled={busy}
          title="Delete site"
          style={{
            ...iconBtn,
            cursor: busy ? "not-allowed" : "pointer",
            opacity: busy ? 0.4 : 1,
          }}
        >
          <AGlyph name="trash" size={14} color={AC.mute} />
        </button>
      </div>
    </ExpandableRow>
  );
}
