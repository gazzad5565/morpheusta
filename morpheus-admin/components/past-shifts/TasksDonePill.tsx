import { AC } from "@/lib/tokens";

/**
 * Inline progress pill — "done / total" with three tones:
 *   - green when the rep cleared every task,
 *   - red when nothing was done,
 *   - brand-soft when partially complete,
 *   - neutral when the shift had no tasks defined.
 */
export function TasksDonePill({
  done,
  total,
}: {
  done: number;
  total: number;
}) {
  const allDone = total > 0 && done >= total;
  const none = total === 0;
  const bg = none
    ? AC.bg
    : allDone
    ? "#dcf6e3"
    : done === 0
    ? AC.dangerTint
    : AC.brandSoft;
  const fg = none
    ? AC.mute
    : allDone
    ? "#1f7a3f"
    : done === 0
    ? "#9c1a3c"
    : AC.brandDeep;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 8px",
        borderRadius: 99,
        background: bg,
        color: fg,
        fontFamily: AC.font,
        fontSize: 11.5,
        fontWeight: 700,
        letterSpacing: -0.1,
      }}
    >
      {done} / {total}
    </span>
  );
}
