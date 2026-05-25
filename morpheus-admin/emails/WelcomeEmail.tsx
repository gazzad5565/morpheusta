/**
 * Welcome email — sent on user creation (bulk import + "Email this
 * user" button on edit pages).
 *
 * Rendered server-side by Resend's `react` prop, which pipes through
 * @react-email/render to produce inline-styled HTML. Built from
 * @react-email/components so the layout survives Gmail's CSS stripper
 * and Outlook's table-only rendering quirks.
 *
 * Props are intentionally minimal — the bulk-import path and the
 * single-user button both call sendEmail() with the same shape, so
 * the template doesn't need to know which path it came from.
 */

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

export interface WelcomeEmailProps {
  /** Display name. Empty / null → falls back to "Hi there,". */
  name: string | null;
  email: string;
  /** Temporary password the user can sign in with. */
  password: string;
  /** Full URL the CTA button opens. Admin URL for managers, mobile
   *  URL for reps — caller picks. */
  appUrl: string;
  role: "rep" | "manager";
}

export default function WelcomeEmail({
  name,
  email,
  password,
  appUrl,
  role,
}: WelcomeEmailProps) {
  const greeting = name?.trim() ? `Hi ${name.trim()},` : "Hi there,";
  const roleCopy =
    role === "manager"
      ? "Your manager account is ready. The admin console is where you schedule shifts, manage customers, and watch Live Ops in real time."
      : "Your rep account is ready. The mobile app is where you'll see today's shifts, check in on-site, capture photos, and message your manager.";
  const ctaLabel =
    role === "manager" ? "Open the admin console" : "Open the rep app";

  return (
    <Html>
      <Head />
      <Preview>Welcome to Morpheus Ops — your login is inside</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={brand}>Morpheus Ops</Heading>
          <Text style={tagline}>Workforce Operations. In real time.</Text>

          <Text style={paragraph}>{greeting}</Text>
          <Text style={paragraph}>{roleCopy}</Text>

          <Section style={credBlock}>
            <Text style={credLabel}>Email</Text>
            <Text style={credValue}>{email}</Text>
            <Text style={{ ...credLabel, marginTop: 14 }}>Temporary password</Text>
            <Text style={credValue}>{password}</Text>
          </Section>

          <Section style={{ textAlign: "center", margin: "28px 0" }}>
            <Button href={appUrl} style={button}>
              {ctaLabel}
            </Button>
          </Section>

          <Text style={paragraph}>
            Once you&apos;re in, head to Profile → Change password to set
            something memorable.
          </Text>

          <Hr style={hr} />
          <Text style={footer}>
            Morpheus Ops · Workforce Operations. In real time.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────
//
// Inline-style objects so @react-email/render can flatten them into
// table cells. Hex colours match the admin's AC tokens (kept literal
// here so the email lib doesn't import the design-tokens file, which
// drags in client-only deps).

const body: React.CSSProperties = {
  backgroundColor: "#F4F6F8",
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  margin: 0,
  padding: 0,
};

const container: React.CSSProperties = {
  backgroundColor: "#FFFFFF",
  borderRadius: 12,
  margin: "32px auto",
  padding: "32px 28px",
  maxWidth: 520,
  border: "1px solid #E2E8F0",
};

const brand: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 700,
  letterSpacing: -0.4,
  color: "#0F172A",
  margin: 0,
};

const tagline: React.CSSProperties = {
  fontSize: 12,
  color: "#64748B",
  margin: "4px 0 24px 0",
  fontWeight: 500,
};

const paragraph: React.CSSProperties = {
  fontSize: 14,
  lineHeight: 1.55,
  color: "#1E293B",
  margin: "0 0 14px 0",
};

const credBlock: React.CSSProperties = {
  backgroundColor: "#F8FAFC",
  borderRadius: 10,
  padding: "16px 18px",
  border: "1px solid #E2E8F0",
  margin: "20px 0",
};

const credLabel: React.CSSProperties = {
  fontSize: 10.5,
  color: "#64748B",
  fontWeight: 700,
  letterSpacing: 0.4,
  textTransform: "uppercase",
  margin: 0,
};

const credValue: React.CSSProperties = {
  fontFamily:
    "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
  fontSize: 14,
  fontWeight: 600,
  color: "#0F172A",
  margin: "4px 0 0 0",
  wordBreak: "break-all",
};

const button: React.CSSProperties = {
  backgroundColor: "#15B4D6",
  color: "#FFFFFF",
  fontSize: 14,
  fontWeight: 700,
  padding: "12px 24px",
  borderRadius: 10,
  textDecoration: "none",
  display: "inline-block",
};

const hr: React.CSSProperties = {
  border: "none",
  borderTop: "1px solid #E2E8F0",
  margin: "28px 0 16px 0",
};

const footer: React.CSSProperties = {
  fontSize: 11,
  color: "#94A3B8",
  textAlign: "center",
  margin: 0,
};
