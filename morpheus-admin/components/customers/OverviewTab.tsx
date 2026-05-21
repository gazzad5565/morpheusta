"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Btn } from "@/components/ui/Btn";
import { Card } from "@/components/ui/Card";
import { AGlyph } from "@/components/ui/AGlyph";
import { AC } from "@/lib/tokens";
import type { Customer } from "@/lib/types";

// MapLibre needs `window`; client-only.
const AddressMap = dynamic(
  () => import("@/components/CustomerAddressMap").then((m) => m.CustomerAddressMap),
  { ssr: false }
);

/**
 * Location on Overview reads directly from the customer row (address /
 * latitude / longitude / geofence — set on /customers/[id]/edit → Location).
 * The Sites tab manages additional locations the customer operates from;
 * those are not surfaced here.
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <Stat label="Reps assigned" value={stats.repsAssigned} />
        <Stat label="Tasks defined" value={stats.tasks} />
        <Stat label="Library files" value={stats.files} />
        <Stat label="Shifts today" value={stats.shiftsToday} />
      </div>

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
              customer.address
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
