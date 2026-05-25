/**
 * Invite email — sent when a manager hits "Email this user" with
 * regenerate=false (the safer default — doesn't change the user's
 * existing password).
 *
 * Pairs with the recovery-link path on /api/users/[id]/send-credentials:
 * Supabase generates a one-time link via auth.admin.generateLink({type:
 * 'recovery', email, options: {redirectTo: <admin or mobile URL>}});
 * clicking it signs the user in to the right app and they can pick a
 * permanent password from Profile → Change password.
 *
 * Distinct from WelcomeEmail (which shows a literal password) because
 * we never want to expose the user's CURRENT password — we don't even
 * know it (Supabase stores hashes). For the regenerate=true path, the
 * caller uses WelcomeEmail with the freshly-generated password instead.
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

export interface InviteEmailProps {
  /** Display name. Empty / null → "Hi there,". */
  name: string | null;
  email: string;
  /** Supabase-generated recovery link. Clicking it signs the user in. */
  actionUrl: string;
  role: "rep" | "manager";
}

export default function InviteEmail({
  name,
  email,
  actionUrl,
  role,
}: InviteEmailProps) {
  const greeting = name?.trim() ? `Hi ${name.trim()},` : "Hi there,";
  const roleCopy =
    role === "manager"
      ? "Your manager account is ready. Click the button below to sign in to the admin console — once you're in, head to Profile → Change password to pick a permanent password."
      : "Your rep account is ready. Click the button below to sign in to the mobile app — once you're in, head to Profile → Change password to pick a permanent password.";

  return (
    <Html>
      <Head />
      <Preview>You&apos;ve been invited to Morpheus Ops — tap to sign in</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={brand}>Morpheus Ops</Heading>
          <Text style={tagline}>Workforce Operations. In real time.</Text>

          <Text style={paragraph}>{greeting}</Text>
          <Text style={paragraph}>{roleCopy}</Text>

          <Text style={emailLine}>
            <span style={emailLabel}>Account: </span>
            <span style={emailValue}>{email}</span>
          </Text>

          <Section style={{ textAlign: "center", margin: "28px 0" }}>
            <Button href={actionUrl} style={button}>
              Sign in to Morpheus Ops
            </Button>
          </Section>

          <Text style={fineprint}>
            This link is good for a single sign-in. If it expires before
            you tap it, ask your manager to send a fresh invite from the
            admin console.
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
// Same literal tokens as WelcomeEmail.tsx — kept inline so the email
// module stays free of client-only dependencies.

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

const emailLine: React.CSSProperties = {
  fontSize: 13,
  lineHeight: 1.55,
  color: "#1E293B",
  margin: "8px 0 0 0",
};

const emailLabel: React.CSSProperties = {
  color: "#64748B",
};

const emailValue: React.CSSProperties = {
  fontFamily:
    "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
  fontWeight: 600,
  color: "#0F172A",
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

const fineprint: React.CSSProperties = {
  fontSize: 12,
  color: "#64748B",
  lineHeight: 1.5,
  margin: "0 0 14px 0",
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
