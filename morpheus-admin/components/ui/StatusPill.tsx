import { AC, type StatusKey } from "@/lib/tokens";

interface Props {
  status: StatusKey | string;
  size?: "sm" | "lg";
}

export function StatusPill({ status, size = "sm" }: Props) {
  const s = AC.status[status as StatusKey] || AC.status.offline;
  const px = size === "lg" ? "5px 11px" : "3px 9px";
  const fz = size === "lg" ? 12 : 11;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: px,
        borderRadius: 999,
        background: s.bg,
        color: s.ink,
        fontFamily: AC.font,
        fontSize: fz,
        fontWeight: 600,
        letterSpacing: -0.1,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: 99,
          background: s.dot,
        }}
      />
      {s.label}
    </span>
  );
}
