"use client";
import dynamic from "next/dynamic";
import { useSkyChartUi } from "./skyChartUi";
const SkyChart = dynamic(() => import("./SkyChart"), { ssr: false });
export default function SkyChartHost() {
  const open = useSkyChartUi((s) => s.open);
  return open ? <SkyChart onClose={() => useSkyChartUi.getState().close()} /> : null;
}
