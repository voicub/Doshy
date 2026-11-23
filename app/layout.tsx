import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import "./globals.css";
// The telemetry (.t-*) and device-card (.dc*) rules sit at the same specificity as rules in the inbox, laundry, curtain and compact-chrome sheets that restyle them, so these two must load before every component sheet (the .t-btn / .t-inbox gap, .lc, .dc / .wc gap, ...). Importing them from their components would put them after those sheets.
import "@/components/ui/TelemetryBar.css";
import "@/components/ui/deviceCard.css";
import "./kiosk.css";
import KioskTouch from "@/components/KioskTouch";
import Screensaver from "@/components/Screensaver";
import ViewportClass from "@/components/ViewportClass";
import DisplayHost from "@/components/ui/DisplayHost";

export const metadata: Metadata = {
  title: "Doshy",
  applicationName: "Doshy",
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }, { url: "/icon-192.png", sizes: "192x192", type: "image/png" }], apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Doshy", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
  other: { "apple-mobile-web-app-capable": "yes" }, // older iPhones only read this one (Next writes the newer mobile-web-app-capable)
};

// viewport-fit=cover lets the HUD use env(safe-area-inset-*) on notched tablets/phones; pinch-zoom stays available to the canvases only (the HUD has touch-action: pan-x pan-y, see app/kiosk.css).
// interactiveWidget: the on-screen keyboard shrinks the page (instead of covering it), so a focused field is never hidden behind it.
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#05070a", interactiveWidget: "resizes-content" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>
        <ViewportClass />
        <KioskTouch />
        {children}
        <DisplayHost />
        <Screensaver />
      </body>
    </html>
  );
}
