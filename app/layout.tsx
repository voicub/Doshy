import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import "./theme-tokens.css";
import "./theme-legacy.css";
import "./globals.css";
import "./theme-light.css";
// The telemetry (.t-*) and device-card (.dc*) rules sit at the same specificity as rules in the inbox, laundry, curtain and compact-chrome sheets that restyle them, so these two must load before every component sheet (the .t-btn / .t-inbox gap, .lc, .dc / .wc gap, ...). Importing them from their components would put them after those sheets.
import "@/components/ui/TelemetryBar.css";
import "@/components/ui/deviceCard.css";
import "./kiosk.css";
import "./embed.css";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";
import EmbedClass from "@/components/EmbedClass";
import KioskTouch from "@/components/KioskTouch";
import LiteClass from "@/components/LiteClass";
import Screensaver from "@/components/Screensaver";
import ViewportClass from "@/components/ViewportClass";
import WallDisplay from "@/components/WallDisplay";
import ThemeClass from "@/components/ThemeClass";
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

// The inline script applies this device's theme (lib/theme.ts) before the first paint, so a reload never flashes the wrong colours; `suppressHydrationWarning` because it changes <html> before React looks.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>
        <ThemeClass />
        <ViewportClass />
        <EmbedClass />
        <KioskTouch />
        <LiteClass />
        {children}
        <DisplayHost />
        <WallDisplay />
        <Screensaver />
      </body>
    </html>
  );
}
