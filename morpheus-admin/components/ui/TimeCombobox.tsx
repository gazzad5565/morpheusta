"use client";

/**
 * TimeCombobox — Combobox-driven time picker.
 *
 * Replaces both `<select>` over 30-min HH:MM options and
 * `<input type="time">` across the admin. Native browser time
 * inputs render wildly differently per platform (Chrome's stepper,
 * Safari's wheel, Firefox's bare input) and don't take a custom icon,
 * so every form using one ended up looking visually unaligned with
 * the rest of the Comboboxes on the page.
 *
 * This wrapper:
 *   - generates HH:MM slots every 30 min between the bounds
 *     (default 06:00–22:00 — the operating-hours window the rest of
 *     the app already assumes)
 *   - keeps the current value in the list even when it isn't on a
 *     30-min boundary, so historical shifts at odd times still
 *     round-trip cleanly
 *   - renders as a Combobox with a clock glyph trigger, monospace
 *     label inside the panel, and the Combobox's auto-on search
 *     (>8 options triggers it)
 */
import { Combobox } from "@/components/ui/Combobox";

interface Props {
  value: string;
  onChange: (v: string) => void;
  /** Earliest visible slot, "HH:MM". Default "06:00". */
  min?: string;
  /** Latest visible slot, "HH:MM". Default "22:00". */
  max?: string;
  /** Minutes per slot. Default 30. */
  stepMin?: number;
  placeholder?: string;
  disabled?: boolean;
}

function timeToMin(s: string): number {
  const [h, m] = s.split(":");
  return parseInt(h, 10) * 60 + parseInt(m, 10);
}
function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** "08:00" → "8:00 AM" — easier to scan in a list than 24h. */
function formatTimeLabel(t: string): string {
  const [hh, mm] = t.split(":");
  const h = parseInt(hh, 10);
  if (Number.isNaN(h)) return t;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${mm} ${ampm}`;
}

export function TimeCombobox({
  value,
  onChange,
  min = "06:00",
  max = "22:00",
  stepMin = 30,
  placeholder = "Pick a time",
  disabled,
}: Props) {
  const minM = timeToMin(min);
  const maxM = timeToMin(max);
  const slots: string[] = [];
  for (let m = minM; m <= maxM; m += stepMin) {
    slots.push(`${pad(Math.floor(m / 60))}:${pad(m % 60)}`);
  }
  // Preserve odd-minute legacy values by inserting them at the front.
  if (value && !slots.includes(value)) slots.unshift(value);

  return (
    <Combobox
      value={value || null}
      onChange={(v) => onChange(v ?? "")}
      triggerIcon="clock"
      placeholder={placeholder}
      searchable
      disabled={disabled}
      clearable={false}
      options={slots.map((t) => ({
        value: t,
        label: formatTimeLabel(t),
      }))}
    />
  );
}
