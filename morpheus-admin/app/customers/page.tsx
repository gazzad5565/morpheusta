"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/shell/AdminShell";
import { Btn } from "@/components/ui/Btn";
import { Card } from "@/components/ui/Card";
import { CustomerSwatch } from "@/components/ui/Avatars";
import { SegTabs } from "@/components/ui/SegTabs";
import { FilterChip, Mini } from "@/components/ui/Filters";
import { AC } from "@/lib/tokens";
import { listCustomers } from "@/lib/customers-store";
import type { Customer } from "@/lib/types";

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    listCustomers().then((rows) => {
      if (!cancelled) setCustomers(rows);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AdminShell
      breadcrumbs={["Home", "Customers"]}
      actions={
        <div style={{ display: "flex", gap: 8 }}>
          <Btn icon="upload" size="sm">Import</Btn>
          <Link href="/customers/new" style={{ textDecoration: "none" }}>
            <Btn icon="plus" kind="primary" size="sm">Add customer</Btn>
          </Link>
        </div>
      }
    >
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
        <Card padding={12}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <FilterChip active>
              All{" "}
              <span style={{ color: AC.mute, fontWeight: 500 }}>
                · {customers?.length ?? "…"}
              </span>
            </FilterChip>
            <FilterChip>Active</FilterChip>
            <FilterChip>Tier · Premium</FilterChip>
            <FilterChip>Off-site flags</FilterChip>
            <div style={{ flex: 1 }} />
            <SegTabs tabs={["Grid", "Table", "Map"]} active="Grid" />
          </div>
        </Card>

        {customers === null ? (
          <Card padding={32}>
            <div
              style={{
                fontFamily: AC.font,
                fontSize: 13,
                color: AC.mute,
                textAlign: "center",
              }}
            >
              Loading customers…
            </div>
          </Card>
        ) : customers.length === 0 ? (
          <Card padding={32}>
            <div
              style={{
                fontFamily: AC.font,
                fontSize: 13,
                color: AC.mute,
                textAlign: "center",
              }}
            >
              No customers yet.{" "}
              <Link href="/customers/new" style={{ color: AC.brandDeep, fontWeight: 600 }}>
                Add the first one
              </Link>
              .
            </div>
          </Card>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
            {customers.map((c) => (
              <Link
                key={c.id}
                href={`/customers/${c.id}`}
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <Card
                  padding={0}
                  style={{
                    overflow: "hidden",
                    height: "100%",
                    opacity: c.active === false ? 0.55 : 1,
                  }}
                >
                  <div
                    style={{
                      height: 64,
                      background: `${c.color}18`,
                      position: "relative",
                    }}
                  >
                    <div style={{ position: "absolute", left: 16, bottom: -16 }}>
                      <CustomerSwatch customer={c} size={44} />
                    </div>
                    <span
                      style={{
                        position: "absolute",
                        right: 12,
                        top: 12,
                        padding: "2px 8px",
                        borderRadius: 99,
                        background: "#fff",
                        color: c.active === false ? AC.mute : AC.ok,
                        fontFamily: AC.font,
                        fontSize: 10.5,
                        fontWeight: 700,
                        border: `1px solid ${AC.line}`,
                      }}
                    >
                      ● {c.active === false ? "Inactive" : "Active"}
                    </span>
                  </div>
                  <div style={{ padding: "24px 16px 14px" }}>
                    <div
                      style={{
                        fontFamily: AC.font,
                        fontSize: 14,
                        fontWeight: 700,
                        color: AC.ink,
                        letterSpacing: -0.2,
                      }}
                    >
                      {c.name}
                    </div>
                    <div
                      style={{
                        fontFamily: AC.font,
                        fontSize: 11.5,
                        color: AC.mute,
                        marginTop: 2,
                      }}
                    >
                      {c.code} · {c.region}
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(3, 1fr)",
                        gap: 10,
                        marginTop: 12,
                        padding: 10,
                        background: AC.bg,
                        borderRadius: 8,
                      }}
                    >
                      <Mini label="Sites" value={c.sites} />
                      <Mini label="Geofence" value={`${c.geofence}m`} />
                      <Mini label="Wk shifts" value={c.shiftsThisWeek} />
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AdminShell>
  );
}
