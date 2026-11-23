"use client";
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "../scene/motion";

const DURATION_MS = 600;

const formatLive = (v: number | undefined, digits: number) => (v === undefined ? "--" : v.toFixed(digits));

/**
 * Tabular number that eases to its new value (instant with reduced motion). Fixed digit count, so the text width does not jump.
 * The state is the text: of the ~36 animation frames only those that change a digit re-render.
 */
export default function LiveNumber({ value, digits = 0 }: { value?: number; digits?: number }) {
  const reduced = useReducedMotion();
  const shownRef = useRef(value);
  const [shown, setShown] = useState(() => formatLive(value, digits));
  useEffect(() => {
    const from = shownRef.current;
    if (value === undefined || from === undefined || from === value || reduced) {
      shownRef.current = value;
      setShown(formatLive(value, digits));
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / DURATION_MS);
      const v = k < 1 ? from + (value - from) * (1 - (1 - k) ** 3) : value;
      shownRef.current = v;
      setShown(formatLive(v, digits));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, digits, reduced]);
  return <span className="lb-num">{shown}</span>;
}
