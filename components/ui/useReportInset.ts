"use client";
import { useEffect, useId, type RefObject } from "react";
import { insetOf } from "@/lib/viewInset";
import { useInsets } from "../scene/edit/insetStore";

/** Tells the 3D view how much of the canvas this sheet covers (a right edge in landscape, the bottom in portrait), so the scene stays centred in what is left. Clears itself when the sheet goes or `on` is false. */
export default function useReportInset(ref: RefObject<HTMLElement | null>, on = true) {
  const id = useId();
  useEffect(() => {
    const el = ref.current;
    if (!el || !on) return;
    const measure = () => useInsets.getState().report(id, insetOf(el.getBoundingClientRect(), innerWidth, innerHeight));
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    addEventListener("resize", measure);
    measure();
    const t = setTimeout(measure, 350); // after the slide-in
    return () => {
      ro.disconnect();
      clearTimeout(t);
      removeEventListener("resize", measure);
      useInsets.getState().clear(id);
    };
  }, [id, ref, on]);
}
