"use client";

/**
 * ColumnResizer — small drag handle for resizable table columns.
 *
 * Usage: drop one inside the right edge of every header cell EXCEPT
 * the last. Position absolutely; the parent header cell needs
 * `position: relative` (a div wrapper works fine).
 *
 *   <div style={{ position: "relative" }}>
 *     Customer name
 *     <ColumnResizer index={0} cols={cols} />
 *   </div>
 *
 * Behaviour:
 *   - Mouse down: capture starting x + starting width.
 *   - Mouse move (window-level): compute delta, update column N's width.
 *     Neighbour columns don't shift — the whole row gets wider/narrower.
 *     Container scrolls horizontally if it overflows.
 *   - Mouse up: release.
 *   - Double-click: reset that column to its default.
 *   - Min width: enforced inside the hook (60px).
 *
 * Visual: ~6px-wide invisible hit area, with a 1px line that brightens
 * on hover and during drag.
 */

import { useEffect, useRef, useState } from "react";
import { AC } from "@/lib/tokens";
import type { ColumnWidths } from "@/lib/use-column-widths";

export interface ColumnResizerProps {
  /** Index of the column whose width this handle controls. */
  index: number;
  /** The cols object returned by useColumnWidths. */
  cols: ColumnWidths;
}

export function ColumnResizer({ index, cols }: ColumnResizerProps) {
  const [dragging, setDragging] = useState(false);
  const [hover, setHover] = useState(false);
  // Refs so the window-level mousemove handler always has the latest
  // start values without re-binding the listener on every drag tick.
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const delta = e.clientX - startXRef.current;
      cols.setWidth(index, startWidthRef.current + delta);
    };
    const onUp = () => setDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    // Lock the cursor + disable text selection on the body for the
    // duration of the drag — without this the cursor flips back to
    // text whenever it leaves the handle, and accidentally selects
    // header text. Both restored in the cleanup.
    const prevCursor = document.body.style.cursor;
    const prevSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevSelect;
    };
  }, [dragging, cols, index]);

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    startXRef.current = e.clientX;
    startWidthRef.current = cols.widths[index] ?? 0;
    setDragging(true);
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    cols.resetColumn(index);
  };

  const active = dragging || hover;

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize column (double-click to reset)"
      title="Drag to resize · double-click to reset"
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: "absolute",
        top: 0,
        right: -3,
        bottom: 0,
        width: 6,
        cursor: "col-resize",
        // High z-index so the hit area sits over the next column's
        // padding too — wider effective target than the visual line.
        zIndex: 2,
        // Visual line — invisible by default, brand-tinted on
        // hover/drag so the user knows they've grabbed it.
        background: active ? AC.brand : "transparent",
        opacity: active ? 0.85 : 1,
        transition: "background .12s ease",
      }}
    />
  );
}
