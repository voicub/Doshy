"use client";
import dynamic from "next/dynamic";

// Plan lives in localStorage and three.js needs the browser, so skip SSR. AppRoot picks the dashboard, or the 3D scene alone for `?embed=1`.
const AppRoot = dynamic(() => import("@/components/AppRoot"), { ssr: false });

export default function Page() {
  return <AppRoot />;
}
