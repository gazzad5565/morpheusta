import * as React from "react";
import { AC } from "@/lib/tokens";

interface Props {
  /** The tab's section title — rendered at 13/700 ink, vertically centered. */
  title: string;
  /** Optional count pill — appears immediately after the title. Renders
   *  even at zero so the row never reflows when the first item is added. */
  count?: number;
  /** Trailing action (primary "Add" button, "Saving…" indicator, etc.).
   *  Pushed to the far right via a flex spacer. */
  action?: React.ReactNode;
}

/**
 * Standard header row for a tab body inside a Card.
 *
 *   <Card padding={0}>
 *     <TabHeader title="Tasks at this customer" count={tasks.length}
 *                action={<Btn>Add task</Btn>} />
 *     ...
 *   </Card>
 *
 * Replaces the prior pattern of hand-rolling a flex row + <SectionTitle>
 * + count <span> on every tab — that pattern had a subtle vertical
 * misalignment because <SectionTitle> ships with marginBottom: 10 for
 * its top-of-card use case, which pushed the title text above the
 * row's true center.
 */
/**
 * The uppercase column-header row that sits directly below a TabHeader
 * (or below an inline editor form) in every list-style tab body.
 *
 *   <Card padding={0}>
 *     <TabHeader ... />
 *     <TableColumnHeader columns={CONTACT_COLS}>
 *       <div>Name</div><div>Phone</div><div>Email</div><div />
 *     </TableColumnHeader>
 *     ...rows
 *   </Card>
 *
 * Pass `borderTop` when there's an inline editor card directly above —
 * matches the original hand-rolled pattern which added a top border
 * only when an "Add"/"Edit" form was open.
 *
 * Children are usually plain <div> cells, but can be <SortableHeader>
 * for sortable columns (the styling is on the row, not the children).
 */
export function TableColumnHeader({
  columns,
  borderTop,
  children,
}: {
  columns: string;
  borderTop?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: columns,
        gap: 14,
        alignItems: "center",
        padding: "10px 16px",
        background: AC.bg,
        borderTop: borderTop ? `1px solid ${AC.line}` : "none",
        borderBottom: `1px solid ${AC.line}`,
        fontFamily: AC.font,
        fontSize: 11,
        fontWeight: 600,
        color: AC.mute,
        letterSpacing: 0.3,
        textTransform: "uppercase",
      }}
    >
      {children}
    </div>
  );
}

export function TabHeader({ title, count, action }: Props) {
  return (
    <div
      style={{
        padding: "14px 16px",
        borderBottom: `1px solid ${AC.line}`,
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      <div
        style={{
          fontFamily: AC.font,
          fontSize: 13,
          fontWeight: 700,
          color: AC.ink,
          letterSpacing: -0.1,
        }}
      >
        {title}
      </div>
      {typeof count === "number" && (
        <span
          style={{
            padding: "2px 7px",
            borderRadius: 99,
            background: AC.bg,
            color: AC.mute,
            fontFamily: AC.font,
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          {count}
        </span>
      )}
      <div style={{ flex: 1 }} />
      {action}
    </div>
  );
}
