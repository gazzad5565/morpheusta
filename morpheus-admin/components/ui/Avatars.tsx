import { AC } from "@/lib/tokens";
import type { Customer, Rep } from "@/lib/types";

export function CustomerSwatch({ customer, size = 32 }: { customer: Customer; size?: number }) {
  const r = size <= 32 ? 7 : 9;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: r,
        background: customer.color,
        color: "#fff",
        fontFamily: AC.font,
        fontSize: size <= 28 ? 10.5 : 11.5,
        fontWeight: 700,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        letterSpacing: 0.2,
        flexShrink: 0,
      }}
    >
      {customer.initials}
    </div>
  );
}

export function RepAvatar({ rep, size = 32 }: { rep: Pick<Rep, "initials">; size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 99,
        background: "#E4E7EB",
        color: AC.ink2,
        fontFamily: AC.font,
        fontSize: size <= 28 ? 10 : 11.5,
        fontWeight: 700,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        letterSpacing: 0.2,
        flexShrink: 0,
      }}
    >
      {rep.initials}
    </div>
  );
}
