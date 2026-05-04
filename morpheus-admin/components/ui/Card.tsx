import * as React from "react";
import { AC } from "@/lib/tokens";

interface Props extends React.HTMLAttributes<HTMLDivElement> {
  padding?: number | string;
}

export function Card({ children, padding = 16, style, ...rest }: Props) {
  return (
    <div
      {...rest}
      style={{
        background: AC.card,
        border: `1px solid ${AC.line}`,
        borderRadius: AC.radiusCard,
        padding,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function SectionTitle({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 10,
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
        {children}
      </div>
      {action}
    </div>
  );
}
