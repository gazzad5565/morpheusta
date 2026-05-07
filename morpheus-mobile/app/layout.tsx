import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { MenuShell } from "@/components/MenuShell";
import { AuthGate } from "@/components/AuthGate";
import { RequestResolutionWatcher } from "@/components/RequestResolutionWatcher";

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
          </AuthGate>
        </div>
      </body>
    </html>
  );
}
