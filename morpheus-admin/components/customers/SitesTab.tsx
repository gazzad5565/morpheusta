"use client";

/**
 * Sites tab on the customer detail page. Lists every site (location)
 * belonging to a customer with full CRUD.
 *
 * UI follows the same archetype as Contacts on this same page:
 *
 *   - One wrapping Card with a <TabHeader> on top
 *   - Compact table-style rows (Name / Address / Geofence / actions)
 *   - Click row → expand to reveal map preview + contact + access notes
 *   - Pencil → expand row into an inline editor (split form + live map)
 *   - Trash  → hard-delete with confirmation (blocked when shifts FK)
 *   - Deactivate / Reactivate lives in the expanded panel (it's a mode
 *     toggle, not a row action — soft-delete that keeps shift history)
 *
 * Inactive sites render at opacity 0.6 with an "Inactive" badge; the
 * show/hide toggle sits in a footer strip when there's anything to
 * hide.
 *
 * Sites state lives in the parent (CustomerDetailPage) so OverviewTab
 * and SitesTab share one fetch — `sites` arrives as a prop, and a
 * `reload` callback re-fetches after CRUD.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { Btn } from "@/components/ui/Btn";
import { Card } from "@/components/ui/Card";
import { EmptyState, TabLoading } from "@/components/ui/EmptyState";
import { TabHeader, TableColumnHeader } from "@/components/ui/TabHeader";
import { SiteEditor } from "./SiteEditor";
import { SiteRow, SITE_COLS } from "./SiteRow";
import { AC } from "@/lib/tokens";
import type { CustomerSite } from "@/lib/sites-store";
import type { Customer } from "@/lib/types";

export function SitesTab({
  customer,
  sites,
  reload,
}: {
  customer: Customer;
  sites: CustomerSite[] | null;
  reload: () => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const visible = useMemo(() => {
    const all = sites ?? [];
    return showInactive ? all : all.filter((s) => s.active);
  }, [sites, showInactive]);

  const inactiveCount = (sites ?? []).filter((s) => !s.active).length;
  const count = visible.length;

  if (sites === null) {
    return (
      <Card padding={0}>
        <TabHeader title="Sites at this customer" />
        <TabLoading label="Loading sites…" />
      </Card>
    );
  }

  return (
    <Card padding={0}>
      <TabHeader
        title="Sites at this customer"
        count={count}
        action={
          !adding && count > 0 ? (
            <div style={{ display: "flex", gap: 8 }}>
              {/* Mariska G4: explicit label. URL unchanged. */}
              <Link href="/settings/import/site" style={{ textDecoration: "none" }}>
                <Btn size="sm" icon="upload">
                  Bulk import sites
                </Btn>
              </Link>
              <Btn
                size="sm"
                kind="primary"
                icon="plus"
                onClick={() => {
                  setEditingId(null);
                  setAdding(true);
                }}
              >
                Add site
              </Btn>
            </div>
          ) : null
        }
      />

      {adding && (
        <SiteEditor
          mode="create"
          customer={customer}
          initial={null}
          onCancel={() => setAdding(false)}
          onSaved={async () => {
            setAdding(false);
            await reload();
          }}
        />
      )}

      {count === 0 && !adding ? (
        <EmptyState
          icon="pin"
          title="No sites yet"
          hint="Attach the customer's first location so reps can check in on site with geofence-backed accuracy."
          actionLabel="Add site"
          onAction={() => setAdding(true)}
        />
      ) : (
        <>
          {count > 0 && (
            <TableColumnHeader columns={SITE_COLS} borderTop={adding}>
              <div>Name</div>
              <div>Address</div>
              <div>Geofence</div>
              <div />
            </TableColumnHeader>
          )}

          {visible.map((s, i) => {
            if (editingId === s.id) {
              return (
                <SiteEditor
                  key={s.id}
                  mode="edit"
                  customer={customer}
                  initial={s}
                  onCancel={() => setEditingId(null)}
                  onSaved={async () => {
                    setEditingId(null);
                    await reload();
                  }}
                />
              );
            }
            return (
              <SiteRow
                key={s.id}
                site={s}
                customer={customer}
                isLast={i === visible.length - 1}
                expanded={expandedId === s.id}
                onToggleExpand={() =>
                  setExpandedId(expandedId === s.id ? null : s.id)
                }
                onEdit={() => {
                  setAdding(false);
                  setEditingId(s.id);
                  setExpandedId(null);
                }}
                onChanged={reload}
              />
            );
          })}
        </>
      )}

      {/* Footer strip — toggle inactive sites in/out. Only renders when
          the customer has any inactive sites. */}
      {inactiveCount > 0 && (
        <div
          style={{
            padding: "10px 16px",
            background: AC.bg,
            borderTop: `1px solid ${AC.line}`,
            fontFamily: AC.font,
            fontSize: 11.5,
            color: AC.mute,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span>
            {inactiveCount} inactive site{inactiveCount === 1 ? "" : "s"} hidden
          </span>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            onClick={() => setShowInactive((v) => !v)}
            style={{
              background: "transparent",
              border: "none",
              padding: 0,
              color: AC.brandDeep,
              cursor: "pointer",
              fontFamily: AC.font,
              fontSize: 11.5,
              fontWeight: 600,
            }}
          >
            {showInactive ? "Hide inactive" : `Show ${inactiveCount} inactive`}
          </button>
        </div>
      )}
    </Card>
  );
}
