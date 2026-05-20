import * as React from "react";
import { AGlyph } from "@/components/ui/AGlyph";
import { AC } from "@/lib/tokens";

/**
 * Animated row-toggle chevron — rotates from 0deg (collapsed) to 90deg
 * (expanded). Used in the leading cell of an ExpandableRow so a user
 * can see at a glance whether the row is open.
 */
export function ExpandChevron({ expanded }: { expanded: boolean }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        color: AC.mute,
        transition: "transform .15s ease",
        transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
      }}
      aria-hidden
    >
      <AGlyph name="chev-r" size={12} color={AC.mute} />
    </span>
  );
}

/**
 * Click-to-expand row used inside the table-style tab bodies on
 * /customers/[id] (Contacts, Sites). Encapsulates the wrapper +
 * clickable cell + keyboard-accessible toggle, plus the panel that
 * slides in beneath the row when expanded.
 *
 *   <ExpandableRow
 *     expanded={isOpen}
 *     onToggle={() => setOpenId(isOpen ? null : c.id)}
 *     expandable={!!c.notes}       // row stays clickable only if there's something to reveal
 *     isLast={i === count - 1}      // hides the bottom rule on the final row
 *     columns={CONTACT_COLS}
 *     panel={<NotesAccordion ... />}
 *   >
 *     ...row cells...
 *   </ExpandableRow>
 *
 * The `opacity` prop lets a caller dim the whole row (e.g. inactive
 * sites) without having to wrap the row in another container.
 */
export function ExpandableRow({
  expanded,
  onToggle,
  expandable = true,
  isLast,
  columns,
  opacity,
  panel,
  children,
}: {
  expanded: boolean;
  onToggle: () => void;
  /** When false the row is not interactive — no cursor, no role, no
   *  keyboard handler. Useful for rows that have no panel content. */
  expandable?: boolean;
  isLast: boolean;
  columns: string;
  opacity?: number;
  /** Rendered beneath the row's clickable strip when expanded. */
  panel?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        borderBottom: !isLast ? `1px solid ${AC.lineDim}` : "none",
        background: expanded ? AC.brandSoft : "#fff",
        transition: "background .15s ease",
        opacity,
      }}
    >
      <div
        onClick={expandable ? onToggle : undefined}
        role={expandable ? "button" : undefined}
        tabIndex={expandable ? 0 : undefined}
        onKeyDown={(e) => {
          if (!expandable) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        style={{
          padding: "12px 16px",
          display: "grid",
          gridTemplateColumns: columns,
          gap: 14,
          alignItems: "center",
          cursor: expandable ? "pointer" : "default",
        }}
      >
        {children}
      </div>
      {expanded && panel}
    </div>
  );
}
