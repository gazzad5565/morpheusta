import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { MenuShell } from "@/components/MenuShell";
import { AuthGate } from "@/components/AuthGate";
import { RequestResolutionWatcher } from "@/components/RequestResolutionWatcher";
import { ShiftAssignmentWatcher } from "@/components/ShiftAssignmentWatcher";
import { PendingRequestPill } from "@/components/PendingRequestPill";
import { MessageBanner } from "@/components/MessageBanner";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Morpheus · Shift Check-in",
  description: "Field rep app — Time & Attendance",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Morpheus",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#171A1F",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <div className="phone-frame">
          <AuthGate>
            <MenuShell>{children}</MenuShell>
            {/* Listens for request.scheduled / request.declined events
                fired by admin and surfaces a tappable banner. Renders
                nothing while idle. Mounted at layout level so banners
                show on whatever page the rep is on. */}
            <RequestResolutionWatcher />
            {/* Banners when admin assigns a new shift to this rep, or
                reassigns an existing shift to them (e.g. via the
                cancellation flow's "Reassign" button). Same shape /
                placement as RequestResolutionWatcher. */}
            <ShiftAssignmentWatcher />
            {/* Tiny floating "N pending — awaiting approval" reminder
                that follows the rep across every page until the admin
                approves or declines. Together with the watcher above
                this gives full closure: a pill while waiting + a
                banner when the result lands. */}
            <PendingRequestPill />
            {/* In-app banner for manager-sent messages (Feature E).
                Renders top-of-screen for ~6s when a new message
                arrives. Suppressed when the rep is already on
                /messages. */}
            <MessageBanner />
          </AuthGate>
        </div>
      </body>
    </html>
  );
}
