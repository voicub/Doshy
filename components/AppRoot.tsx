"use client";
import dynamic from "next/dynamic";
import { parseEmbed } from "@/lib/embed";

// Loaded on demand so an embedded view (`?embed=1`) never downloads the panels, the catalog or the editor.
const Dashboard = dynamic(() => import("./Dashboard"), { ssr: false });
const EmbedDashboard = dynamic(() => import("./EmbedDashboard"), { ssr: false });

/** The page: the whole dashboard, or only the 3D scene when the address says `?embed=1`. Browser only (the page loads it with `ssr: false`). */
export default function AppRoot() {
  return parseEmbed(location.search).embed ? <EmbedDashboard /> : <Dashboard />;
}
