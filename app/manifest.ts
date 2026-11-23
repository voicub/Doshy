import type { MetadataRoute } from "next";

/** "Add to home screen" (phone) and "Install app" (Chromium): Doshy opens as its own full-screen window, which also switches on the kiosk behaviour (`display-mode: standalone`, see components/ViewportClass.tsx). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Doshy",
    short_name: "Doshy",
    description: "Your home in 3D, with your Home Assistant devices.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#05070a",
    theme_color: "#05070a",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
