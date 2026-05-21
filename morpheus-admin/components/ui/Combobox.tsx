"use client";

/**
 * Combobox — single + multi-select dropdown with search.
 *
 * Replaces native <select> across the admin so every dropdown looks
 * the same: clean panel, optional search box, optional multi-select,
 * keyboard nav, click-outside close. Renders the panel via portal so
 * overflow:hidden parents (cards, scroll areas) don't clip it.
 *
 * Single:
 *   <Combobox value={id} onChange={setId} options={[{value, label}, ...]} />
 *
 * Multi:
 *   <Combobox multi value={ids} onChange={setIds} options={...} />
 *
 * Each option can carry an icon, color swatch, and sublabel:
 *   { value, label, sublabel?, icon?, color? }
 */

import {
  CSSProperties,
  ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { AGlyph } from "@/components/ui/AGlyph";
import { AC } from "@/lib/tokens";

export interface ComboboxOption {
  value: string;
  label: string;
  sublabel?: string;
  /** Left-side icon glyph name (from AGlyph) */
  icon?: string;
  /** Left-side color swatch — overrides icon when set */
  color?: string;
  /** Custom left-side renderer (e.g. an avatar). Takes precedence over
   *  `icon` and `color` when provided. Kept as a function so callers
   *  can compute the node lazily and don't pay for ReactNode equality
   *  checks during the option list re-renders. */
  renderLeading?: () => ReactNode;
  /** Hide from search results when true (still rendered if explicitly selected) */
  disabled?: boolean;
}

type SingleProps = {
  multi?: false;
  value: string | null;
  onChange: (next: string | null) => void;
};
type MultiProps = {
  multi: true;
  value: string[];
  onChange: (next: string[]) => void;
};

type Common = {
  options: ComboboxOption[];
  placeholder?: string;
  /** Show a search box at the top of the panel. Auto-on if options.length > 8. */
  searchable?: boolean;
  /** Glyph shown inside the trigger on the left. Default "filter" for filters; pass null to hide. */
  triggerIcon?: string | null;
  /** Tweak trigger width. Default auto. */
  width?: CSSProperties["width"];
  /** Override the rendered trigger label (e.g. "3 customers"). */
  triggerLabel?: string;
  /** Hide the clear "x" affordance. */
  clearable?: boolean;
  /** Show a "Select all / Clear" row above the list (multi only). */
  selectAll?: boolean;
  /** Disabled trigger. */
  disabled?: boolean;
  /** Optional id for testing / a11y. */
  id?: string;
  /** Extra className on the trigger (rare). */
  className?: string;
  /**
   * Optional footer rendered inside the panel below the options list.
   * Receives a `close` callback so the footer's actions (Apply / Cancel)
   * can dismiss the panel programmatically. The footer lives inside
   * the panel's clickable region, so outside-click handlers ignore it
   * — no flicker from the panel collapsing before the click resolves.
   */
  footer?: (ctx: { close: () => void }) => ReactNode;
};

export type ComboboxProps = Common & (SingleProps | MultiProps);

export function Combobox(props: ComboboxProps) {
  const {
    options,
    placeholder = "Select…",
    triggerIcon,
    width,
    triggerLabel,
    clearable = true,
    selectAll = true,
    disabled,
    id,
    className,
    footer,
  } = props;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({});
  // Stays false from open=true until reposition has run at least once.
  // Without this the panel briefly paints at the viewport's top-left
  // on the first open cycle — the panelStyle is still {} (initial
  // state) when the panel first lands in the DOM, before
  // useLayoutEffect computes real coords.
  const [positioned, setPositioned] = useState(false);

  const isMulti = props.multi === true;
  const showSearch = props.searchable ?? options.length > 8;

  // Compute the "selected label" shown on the trigger.
  const renderedTrigger = useMemo(() => {
    if (triggerLabel) return triggerLabel;
    if (isMulti) {
      const arr = (props as MultiProps).value;
      if (arr.length === 0) return placeholder;
      if (arr.length === 1) {
        return options.find((o) => o.value === arr[0])?.label ?? placeholder;
      }
      return `${arr.length} selected`;
    }
    const v = (props as SingleProps).value;
    if (v == null) return placeholder;
    return options.find((o) => o.value === v)?.label ?? placeholder;
  }, [props, options, placeholder, triggerLabel, isMulti]);

  // Filter options by query.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || o.sublabel?.toLowerCase().includes(q)
    );
  }, [options, query]);

  // Position the portal panel below the trigger, clamped to the
  // viewport so triggers near the right edge (e.g. the customer
  // filter on /tasks) don't render the panel off-screen. Flips
  // above the trigger when there isn't enough room below.
  const reposition = useCallback(() => {
    const t = triggerRef.current;
    if (!t) return;
    const r = t.getBoundingClientRect();
    const minWidth = Math.max(r.width, 220);
    const margin = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // If the panel has already mounted, measure it; otherwise fall
    // back to the minWidth / maxHeight we render with so the first
    // pass still avoids the worst overflow.
    const p = panelRef.current?.getBoundingClientRect();
    const panelW = p?.width ?? minWidth;
    const panelH = p?.height ?? 360;

    let left = r.left;
    if (left + panelW > vw - margin) left = vw - panelW - margin;
    if (left < margin) left = margin;

    let top = r.bottom + 6;
    if (top + panelH > vh - margin && r.top - 6 - panelH > margin) {
      top = r.top - 6 - panelH;
    }

    setPanelStyle({
      position: "fixed",
      top,
      left,
      minWidth,
      maxWidth: vw - margin * 2,
      zIndex: 1000,
    });
    setPositioned(true);
  }, []);

  useLayoutEffect(() => {
    if (open) {
      reposition();
    } else if (positioned) {
      // Reset so the next open cycle starts hidden until repositioned.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPositioned(false);
    }
  }, [open, reposition, positioned]);

  // Click outside closes.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onResize() {
      reposition();
    }
    document.addEventListener("mousedown", onDown);
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [open, reposition]);

  // Focus search on open.
  useEffect(() => {
    if (open && showSearch) {
      const id = setTimeout(() => searchRef.current?.focus(), 0);
      return () => clearTimeout(id);
    }
  }, [open, showSearch]);

  // Reset query/index when reopening. Intentional reset-on-toggle
  // pattern — the panel should always open fresh, not remember the
  // last search or cursor position.
  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQuery("");
      setActiveIndex(0);
    }
  }, [open]);

  // When the menu opens, jump straight to the currently-selected
  // value's row instead of starting at the top of the list.
  // Without this, opening a TimeCombobox at "1:00 PM" rendered the
  // panel scrolled to 6:00 AM and the manager had to scroll a long
  // way to find their current value. We also pre-set activeIndex
  // so keyboard arrows continue from the right row.
  //
  // Runs after the panel mounts via a microtask (queueMicrotask)
  // because the portal renders the list on the same tick and
  // scrollIntoView before it's in the DOM is a no-op. Block:
  // "center" keeps the row visually mid-list so the rep can see
  // surrounding options at a glance.
  useEffect(() => {
    if (!open) return;
    // Find the first selected option in the filtered list. For
    // single-select that's the value; for multi-select we land on
    // the first picked option, which still beats the top.
    let selectedIdx = -1;
    if (isMulti) {
      const set = new Set((props as MultiProps).value);
      selectedIdx = filtered.findIndex((o) => set.has(o.value));
    } else {
      const v = (props as SingleProps).value;
      if (v != null) selectedIdx = filtered.findIndex((o) => o.value === v);
    }
    if (selectedIdx < 0) return;
    // Jumping the cursor to the selected row on open — the whole point
    // of this effect is to sync the panel's UI state with the prop.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveIndex(selectedIdx);
    queueMicrotask(() => {
      const list = listRef.current;
      if (!list) return;
      // Each ComboOption is a direct child of the list container.
      const row = list.children[selectedIdx] as HTMLElement | undefined;
      if (row?.scrollIntoView) {
        row.scrollIntoView({ block: "center" });
      }
    });
    // We only want this firing on the open → true transition, not
    // every render while open. Hence the [open] dependency only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const selectedSet = useMemo(() => {
    if (isMulti) return new Set((props as MultiProps).value);
    const v = (props as SingleProps).value;
    return new Set(v == null ? [] : [v]);
  }, [props, isMulti]);

  const commit = useCallback(
    (opt: ComboboxOption) => {
      if (opt.disabled) return;
      if (isMulti) {
        const arr = (props as MultiProps).value;
        const next = arr.includes(opt.value) ? arr.filter((v) => v !== opt.value) : [...arr, opt.value];
        (props as MultiProps).onChange(next);
        // keep open in multi
      } else {
        (props as SingleProps).onChange(opt.value);
        setOpen(false);
      }
    },
    [props, isMulti]
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(filtered.length - 1, i + 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const opt = filtered[activeIndex];
      if (opt) commit(opt);
      return;
    }
  };

  const clearAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isMulti) (props as MultiProps).onChange([]);
    else (props as SingleProps).onChange(null);
  };

  const onSelectAll = () => {
    if (!isMulti) return;
    const arr = (props as MultiProps).value;
    const visibleValues = filtered.filter((o) => !o.disabled).map((o) => o.value);
    const allOn = visibleValues.every((v) => arr.includes(v));
    if (allOn) {
      (props as MultiProps).onChange(arr.filter((v) => !visibleValues.includes(v)));
    } else {
      const next = new Set([...arr, ...visibleValues]);
      (props as MultiProps).onChange(Array.from(next));
    }
  };

  const showClear =
    clearable &&
    !disabled &&
    (isMulti ? (props as MultiProps).value.length > 0 : (props as SingleProps).value != null);

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={className}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 8px 6px 10px",
          borderRadius: 8,
          border: `1px solid ${open ? AC.brand : AC.line}`,
          background: disabled ? AC.bg : "#fff",
          fontFamily: AC.font,
          fontSize: 12,
          fontWeight: 600,
          color: AC.ink,
          cursor: disabled ? "not-allowed" : "pointer",
          minHeight: 32,
          width,
          maxWidth: "100%",
          textAlign: "left",
          boxShadow: open ? `0 0 0 3px ${AC.brand}22` : undefined,
          transition: "border-color 120ms, box-shadow 120ms",
        }}
      >
        {triggerIcon !== null && (
          <AGlyph
            name={triggerIcon ?? "filter"}
            size={13}
            color={open ? AC.brand : AC.hint}
          />
        )}
        <span
          style={{
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            color:
              isMulti
                ? (props as MultiProps).value.length === 0
                  ? AC.hint
                  : AC.ink
                : (props as SingleProps).value == null
                ? AC.hint
                : AC.ink,
          }}
        >
          {renderedTrigger}
        </span>
        {showClear && (
          <span
            role="button"
            aria-label="Clear"
            onClick={clearAll}
            style={{
              display: "inline-flex",
              padding: 2,
              borderRadius: 4,
              cursor: "pointer",
              opacity: 0.7,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.7")}
          >
            <AGlyph name="x" size={11} color={AC.hint} />
          </span>
        )}
        <AGlyph name="chev-d" size={13} color={AC.hint} />
      </button>

      {open && typeof document !== "undefined" &&
        createPortal(
          <div
            ref={panelRef}
            role="listbox"
            style={{
              ...panelStyle,
              background: "#fff",
              border: `1px solid ${AC.line}`,
              borderRadius: 10,
              boxShadow: "0 14px 32px rgba(15,18,22,0.14), 0 2px 8px rgba(15,18,22,0.06)",
              overflow: "hidden",
              fontFamily: AC.font,
              maxHeight: 360,
              display: "flex",
              flexDirection: "column",
              // Hidden until reposition runs so the panel never paints
              // at the viewport's top-left during the initial render.
              visibility: positioned ? "visible" : "hidden",
            }}
            onKeyDown={onKeyDown}
          >
            {showSearch && (
              <div
                style={{
                  position: "relative",
                  padding: "8px 8px 6px",
                  borderBottom: `1px solid ${AC.lineDim}`,
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    left: 16,
                    top: "50%",
                    transform: "translateY(-50%)",
                    pointerEvents: "none",
                  }}
                >
                  <AGlyph name="search" size={12} color={AC.hint} />
                </span>
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setActiveIndex(0);
                  }}
                  placeholder="Search…"
                  style={{
                    width: "100%",
                    padding: "7px 10px 7px 28px",
                    borderRadius: 6,
                    border: `1px solid ${AC.line}`,
                    background: AC.bg,
                    fontFamily: AC.font,
                    fontSize: 12,
                    color: AC.ink,
                    outline: "none",
                  }}
                />
              </div>
            )}

            {isMulti && selectAll && filtered.length > 1 && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "6px 12px",
                  borderBottom: `1px solid ${AC.lineDim}`,
                  background: AC.bg,
                  fontSize: 11,
                  color: AC.mute,
                  fontWeight: 600,
                }}
              >
                <span>
                  {(props as MultiProps).value.length} of {options.length} selected
                </span>
                <button
                  type="button"
                  onClick={onSelectAll}
                  style={{
                    padding: 0,
                    background: "transparent",
                    border: "none",
                    color: AC.brand,
                    fontFamily: AC.font,
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {filtered.every((o) => (props as MultiProps).value.includes(o.value))
                    ? "Clear visible"
                    : "Select visible"}
                </button>
              </div>
            )}

            <div ref={listRef} style={{ overflow: "auto", flex: 1 }}>
              {filtered.length === 0 ? (
                <div
                  style={{
                    padding: "16px 14px",
                    fontFamily: AC.font,
                    fontSize: 12,
                    color: AC.hint,
                    textAlign: "center",
                  }}
                >
                  No matches.
                </div>
              ) : (
                filtered.map((opt, i) => {
                  const sel = selectedSet.has(opt.value);
                  const active = i === activeIndex;
                  return (
                    <ComboOption
                      key={opt.value}
                      opt={opt}
                      selected={sel}
                      active={active}
                      multi={isMulti}
                      onClick={() => commit(opt)}
                      onMouseEnter={() => setActiveIndex(i)}
                    />
                  );
                })
              )}
            </div>

            {footer && (
              <div
                style={{
                  borderTop: `1px solid ${AC.lineDim}`,
                  padding: "8px 10px",
                  background: AC.bg,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  gap: 8,
                  flexShrink: 0,
                }}
              >
                {footer({ close: () => setOpen(false) })}
              </div>
            )}
          </div>,
          document.body
        )}
    </>
  );
}

function ComboOption({
  opt,
  selected,
  active,
  multi,
  onClick,
  onMouseEnter,
}: {
  opt: ComboboxOption;
  selected: boolean;
  active: boolean;
  multi: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
}) {
  return (
    <div
      role="option"
      aria-selected={selected}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 12px",
        cursor: opt.disabled ? "not-allowed" : "pointer",
        opacity: opt.disabled ? 0.5 : 1,
        background: active
          ? selected
            ? AC.brandTint
            : AC.bg
          : selected
          ? AC.brandSoft
          : "#fff",
        color: AC.ink,
        fontSize: 12.5,
        fontWeight: 500,
        borderLeft: `3px solid ${selected ? AC.brand : "transparent"}`,
      }}
    >
      {multi ? (
        <span
          aria-hidden
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 16,
            height: 16,
            borderRadius: 4,
            border: `1.5px solid ${selected ? AC.brand : AC.line}`,
            background: selected ? AC.brand : "#fff",
            flex: "0 0 auto",
          }}
        >
          {selected ? <AGlyph name="check" size={10} color="#fff" /> : null}
        </span>
      ) : (
        <span
          aria-hidden
          style={{
            width: 16,
            display: "inline-flex",
            justifyContent: "center",
            flex: "0 0 auto",
          }}
        >
          {selected ? <AGlyph name="check" size={13} color={AC.brand} /> : null}
        </span>
      )}

      {opt.renderLeading ? (
        <span style={{ display: "inline-flex", flex: "0 0 auto" }}>
          {opt.renderLeading()}
        </span>
      ) : opt.color ? (
        <span
          aria-hidden
          style={{
            width: 12,
            height: 12,
            borderRadius: 3,
            background: opt.color,
            flex: "0 0 auto",
          }}
        />
      ) : opt.icon ? (
        <AGlyph name={opt.icon} size={13} color={AC.mute} />
      ) : null}

      <span style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            display: "block",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontWeight: selected ? 700 : 500,
          }}
        >
          {opt.label}
        </span>
        {opt.sublabel && (
          <span
            style={{
              display: "block",
              fontSize: 11,
              color: AC.hint,
              fontWeight: 500,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {opt.sublabel}
          </span>
        )}
      </span>
    </div>
  );
}
