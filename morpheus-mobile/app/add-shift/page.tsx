"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MC } from "@/lib/tokens";
import { type Customer } from "@/lib/mock-data";
import { addRequestedShift, listRequestedShifts } from "@/lib/shift-store";
import { listAllCustomers } from "@/lib/customers-store";
import { listMyShiftsToday } from "@/lib/shifts-store";
import { AppHeader, AppFooter, CustomerTile } from "@/components/Chrome";
import { Glyph } from "@/components/Glyph";

/**
 * /add-shift — search for a customer and request a shift with them. Adds the
 * customer to the rep's "Unscheduled" list on /shifts via the shift store
 * (Supabase-backed in Phase 2).
 */
export default function AddShiftPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [allCustomers, setAllCustomers] = useState<Customer[] | null>(null);
  // Track which customers have already been requested so we can show
  // a "Requested" state on the row instead of the Request button.
  const [requestedIds, setRequestedIds] = useState<string[]>([]);
  // Customer ids the rep is already scheduled for today — those rows
  // get a "Today" pill instead of a Request button. Pulled from the
  // real shifts table, not mock data.
  const [todayIds, setTodayIds] = useState<Set<string>>(() => new Set());

  // Hydrate everything from the DB on mount.
  useEffect(() => {
    let cancelled = false;
    listRequestedShifts().then((rows) => {
      if (!cancelled) setRequestedIds(rows.map((r) => r.id));
    });
    listAllCustomers().then((rows) => {
      if (!cancelled) setAllCustomers(rows);
    });
    listMyShiftsToday().then((rows) => {
      if (!cancelled) setTodayIds(new Set(rows.map((s) => s.id)));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!allCustomers) return [];
    const q = query.trim().toLowerCase();
    if (!q) return allCustomers;
    return allCustomers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.region.toLowerCase().includes(q) ||
        c.city.toLowerCase().includes(q) ||
        c.initials.toLowerCase().includes(q) ||
        String(c.code).includes(q)
    );
  }, [allCustomers, query]);

  const onRequest = (c: Customer) => {
    // Optimistic — flip UI immediately, persist in the background
    setRequestedIds((ids) => (ids.includes(c.id) ? ids : [...ids, c.id]));
    addRequestedShift({
      id: c.id,
      name: c.name,
      initials: c.initials,
      color: c.color,
      code: c.code,
    });
  };

  return (
    <div style={{ background: MC.bg, minHeight: "100%" }}>
      <AppHeader title="Add shift" onBack={() => router.push("/")} withMenu />

      <div style={{ padding: "20px 16px 0" }}>
        <div
          style={{
            fontFamily: MC.fontDisplay,
            fontSize: 22,
            fontWeight: 700,
            color: MC.ink,
            letterSpacing: -0.5,
          }}
        >
          Request an extra shift
        </div>
        <div
          style={{
            fontFamily: MC.font,
            fontSize: 13,
            color: MC.mute,
            marginTop: 4,
            lineHeight: 1.45,
          }}
        >
          Search any customer and tap{" "}
          <b style={{ color: MC.ink }}>Request</b> to add them to today&apos;s
          unscheduled list. Your manager is notified.
        </div>
      </div>

      {/* Search */}
      <div style={{ padding: "14px 16px 0" }}>
        <div
          style={{
            background: MC.card,
            border: `1px solid ${MC.line}`,
            borderRadius: 12,
            padding: "10px 12px",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <Glyph name="target" size={16} color={MC.hint} strokeWidth={2} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search customers, regions, codes…"
            autoFocus
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              background: "transparent",
              fontFamily: MC.font,
              fontSize: 14,
              color: MC.ink,
            }}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: 0,
                display: "flex",
              }}
            >
              <Glyph name="close" size={14} color={MC.hint} />
            </button>
          )}
        </div>
        <div
          style={{
            fontFamily: MC.font,
            fontSize: 11.5,
            color: MC.hint,
            marginTop: 8,
            paddingLeft: 4,
          }}
        >
          {allCustomers === null
            ? "Loading customers…"
            : `${filtered.length} of ${allCustomers.length} customers`}
        </div>
      </div>

      {/* Results */}
      <div
        style={{
          padding: "12px 16px 22px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {filtered.length === 0 && <EmptyState />}
        {filtered.map((c) => {
          const onToday = todayIds.has(c.id);
          const requested = requestedIds.includes(c.id);
          return (
            <div
              key={c.id}
              style={{
                background: MC.card,
                border: `1px solid ${MC.line}`,
                borderRadius: 12,
                padding: 12,
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              <CustomerTile initials={c.initials} color={c.color} size={40} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: MC.font,
                    fontSize: 14,
                    fontWeight: 600,
                    color: MC.ink,
                    letterSpacing: -0.1,
                  }}
                >
                  {c.name}
                </div>
                <div
                  style={{
                    fontFamily: MC.font,
                    fontSize: 12,
                    color: MC.mute,
                    marginTop: 2,
                  }}
                >
                  #{c.code} · {c.region} · {c.city}
                </div>
              </div>
              {onToday ? (
                <span
                  style={{
                    padding: "4px 10px",
                    borderRadius: 999,
                    background: MC.brandTint,
                    color: MC.brandInk,
                    fontFamily: MC.font,
                    fontSize: 10.5,
                    fontWeight: 700,
                    letterSpacing: 0.5,
                    textTransform: "uppercase",
                  }}
                >
                  Today
                </span>
              ) : requested ? (
                <span
                  style={{
                    padding: "5px 10px",
                    borderRadius: 999,
                    background: MC.okTint,
                    color: "#0d6a45",
                    fontFamily: MC.font,
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: 0.4,
                    textTransform: "uppercase",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <Glyph name="check" size={11} color="#0d6a45" strokeWidth={2.6} />
                  Requested
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => onRequest(c)}
                  style={{
                    padding: "8px 14px",
                    borderRadius: 10,
                    background: MC.brand,
                    color: "#fff",
                    border: "none",
                    cursor: "pointer",
                    fontFamily: MC.font,
                    fontSize: 13,
                    fontWeight: 700,
                    letterSpacing: -0.1,
                    boxShadow: `0 2px 6px ${MC.brand}55`,
                  }}
                >
                  Request
                </button>
              )}
            </div>
          );
        })}
      </div>

      {requestedIds.length > 0 && (
        <div style={{ padding: "0 16px 22px" }}>
          <button
            type="button"
            onClick={() => router.push("/shifts")}
            style={{
              width: "100%",
              padding: "12px 16px",
              borderRadius: 12,
              background: MC.ink,
              color: "#fff",
              border: "none",
              cursor: "pointer",
              fontFamily: MC.font,
              fontSize: 14,
              fontWeight: 600,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              letterSpacing: -0.1,
            }}
          >
            View {requestedIds.length} requested in shifts
            <Glyph name="arrow-r" size={16} color="#fff" strokeWidth={2.2} />
          </button>
        </div>
      )}

      <AppFooter />
    </div>
  );
}

function EmptyState() {
  return (
    <div
      style={{
        padding: 30,
        textAlign: "center",
        fontFamily: MC.font,
        color: MC.mute,
        fontSize: 13.5,
      }}
    >
      <Glyph name="info" size={32} color={MC.hint} strokeWidth={1.6} />
      <div style={{ marginTop: 8 }}>No customers match that search</div>
    </div>
  );
}
