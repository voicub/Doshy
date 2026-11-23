"use client";
import dynamic from "next/dynamic";

// Plan lives in localStorage and three.js needs the browser, so skip SSR.
const Dashboard = dynamic(() => import("@/components/Dashboard"), { ssr: false });

export default function Page() {
  return <Dashboard />;
}
