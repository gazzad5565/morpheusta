import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { MenuShell } from "@/components/MenuShell";
import { AuthGate } from "@/components/AuthGate";

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
          </AuthGate>
        </div>
      </body>
    </html>
  );
}
