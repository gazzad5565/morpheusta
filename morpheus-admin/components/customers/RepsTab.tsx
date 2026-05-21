"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Btn } from "@/components/ui/Btn";
import { Card } from "@/components/ui/Card";
import { AGlyph } from "@/components/ui/AGlyph";
import { EmptyState } from "@/components/ui/EmptyState";
import { TabHeader } from "@/components/ui/TabHeader";
import { Combobox } from "@/components/ui/Combobox";
import { RepAvatar } from "@/components/ui/Avatars";
import { AC } from "@/lib/tokens";
import { initialsFromNameOrEmail } from "@/lib/format";
import { displayName, type Profile } from "@/lib/profiles-store";
import { iconBtn } from "./tabStyles";

export function RepsTab({
  allReps,
  assignedRepIds,
  saving,
  onSave,
}: {
  allReps: Profile[];
  assignedRepIds: string[];
  saving: boolean;
  onSave: (next: string[]) => void;
}) {
  const [picking, setPicking] = useState(false);

  const assignedSet = useMemo(() => new Set(assignedRepIds), [assignedRepIds]);
  const assigned = useMemo(
    () =>
      allReps
        .filter((r) => assignedSet.has(r.id))
        .sort((a, b) => displayName(a).localeCompare(displayName(b))),
    [allReps, assignedSet]
  );
  const available = useMemo(
    () =>
      allReps
        .filter((r) => !assignedSet.has(r.id))
        .sort((a, b) => displayName(a).localeCompare(displayName(b))),
    [allReps, assignedSet]
  );

  function onAssignMany(repIds: string[]) {
    const fresh = repIds.filter((id) => !assignedSet.has(id));
    if (fresh.length === 0) return;
    onSave([...assignedRepIds, ...fresh]);
  }
  function onUnassign(repId: string) {
    onSave(assignedRepIds.filter((x) => x !== repId));
  }

  // Disable the header button when there's nothing to assign.
  const canPickMore = available.length > 0;

  return (
    <Card padding={0}>
      <TabHeader
        title="Assigned reps"
        count={assigned.length}
        action={
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {saving && (
              <span style={{ fontFamily: AC.font, fontSize: 11, color: AC.mute }}>
                Saving…
              </span>
            )}
            {!picking && canPickMore && assigned.length > 0 && (
              <Btn
                size="sm"
                kind="primary"
                icon="plus"
                onClick={() => setPicking(true)}
              >
                Assign rep
              </Btn>
            )}
          </div>
        }
      />

      {picking && (
        <AssignRepPicker
          available={available}
          onAssignMany={(ids) => {
            onAssignMany(ids);
            setPicking(false);
          }}
          onDone={() => setPicking(false)}
        />
      )}

      {allReps.length === 0 ? (
        <EmptyState
          icon="reps"
          title="No reps signed up yet"
          hint="Reps appear here once they create an account on the mobile app."
        />
      ) : assigned.length === 0 && !picking ? (
        <EmptyState
          icon="reps"
          title="No reps assigned to this customer"
          hint="Assigned reps see this customer in their app and can claim or be scheduled for shifts here."
          actionLabel="Assign a rep"
          onAction={() => setPicking(true)}
        />
      ) : (
        assigned.map((r, i) => (
          <RepRow
            key={r.id}
            rep={r}
            isLast={i === assigned.length - 1}
            busy={saving}
            onUnassign={() => onUnassign(r.id)}
          />
        ))
      )}
    </Card>
  );
}

function AssignRepPicker({
  available,
  onAssignMany,
  onDone,
}: {
  available: Profile[];
  onAssignMany: (repIds: string[]) => void;
  onDone: () => void;
}) {
  // Local selection state — accumulates ticks while the panel is open
  // so we can apply them all in a single DB write when the manager
  // hits "Assign".
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const options = useMemo(
    () =>
      available.map((r) => ({
        value: r.id,
        label: displayName(r),
        sublabel: r.email,
        renderLeading: () => (
          <RepAvatar
            rep={{
              initials: initialsFromNameOrEmail(r.name, r.email),
              avatarUrl: r.avatar_url,
            }}
            size={22}
            seed={r.id}
          />
        ),
      })),
    [available]
  );

  return (
    <div
      style={{
        background: AC.bgDeep,
        borderBottom: `1px solid ${AC.line}`,
        padding: "14px 16px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <div
        style={{
          fontFamily: AC.font,
          fontSize: 11,
          fontWeight: 700,
          color: AC.mute,
          letterSpacing: 0.3,
          textTransform: "uppercase",
        }}
      >
        Assign reps
      </div>
      {available.length === 0 ? (
        <div style={{ fontFamily: AC.font, fontSize: 12.5, color: AC.mute }}>
          All reps are already assigned.
        </div>
      ) : (
        <Combobox
          multi
          options={options}
          value={selectedIds}
          onChange={setSelectedIds}
          placeholder="Choose reps to assign…"
          triggerIcon="reps"
          searchable
          selectAll
          width={320}
          triggerLabel={
            selectedIds.length === 0
              ? undefined
              : `${selectedIds.length} selected`
          }
          footer={({ close }) => (
            <>
              <Btn
                size="sm"
                onClick={() => {
                  close();
                  onDone();
                }}
              >
                Cancel
              </Btn>
              <Btn
                size="sm"
                kind="primary"
                icon="plus"
                onClick={() => {
                  onAssignMany(selectedIds);
                  close();
                }}
                disabled={selectedIds.length === 0}
              >
                Assign
                {selectedIds.length > 0
                  ? ` ${selectedIds.length} rep${selectedIds.length === 1 ? "" : "s"}`
                  : ""}
              </Btn>
            </>
          )}
        />
      )}
      <div style={{ flex: 1 }} />
      {available.length === 0 && (
        <Btn size="sm" onClick={onDone}>
          Done
        </Btn>
      )}
    </div>
  );
}

function RepRow({
  rep,
  isLast,
  busy,
  onUnassign,
}: {
  rep: Profile;
  isLast: boolean;
  busy: boolean;
  onUnassign: () => void;
}) {
  const initials = initialsFromNameOrEmail(rep.name, rep.email);
  return (
    <Link
      href={`/reps/${rep.id}`}
      style={{
        display: "grid",
        gridTemplateColumns: "40px 1fr 60px",
        gap: 14,
        alignItems: "center",
        padding: "12px 16px",
        borderBottom: !isLast ? `1px solid ${AC.lineDim}` : "none",
        background: "#fff",
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <RepAvatar
        rep={{ initials, avatarUrl: rep.avatar_url }}
        size={32}
        seed={rep.id}
      />
      <div style={{ minWidth: 0 }}>
        <div
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
          {displayName(rep)}
        </div>
        <div
          style={{
            fontFamily: AC.font,
            fontSize: 11.5,
            color: AC.mute,
            marginTop: 1,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {rep.email}
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onUnassign();
          }}
          disabled={busy}
          title="Unassign rep"
          style={{
            ...iconBtn,
            cursor: busy ? "not-allowed" : "pointer",
            opacity: busy ? 0.4 : 1,
          }}
        >
          <AGlyph name="trash" size={14} color={AC.mute} />
        </button>
      </div>
    </Link>
  );
}
