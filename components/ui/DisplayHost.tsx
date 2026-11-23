"use client";
import { useEffect, useState } from "react";
import { OPEN_DISPLAY_EVENT } from "@/lib/display";
import DisplayPanel from "./DisplayPanel";

/** Mounted once in the root layout: shows the Display settings sheet when something asks for it (`openDisplaySettings`, or the `housey:display` window event). */
export default function DisplayHost() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = () => setOpen(true);
    window.addEventListener(OPEN_DISPLAY_EVENT, on);
    return () => window.removeEventListener(OPEN_DISPLAY_EVENT, on);
  }, []);
  return open ? <DisplayPanel onClose={() => setOpen(false)} /> : null;
}
