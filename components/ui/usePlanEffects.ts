"use client";
import { useEffect } from "react";
import { useActivePlan } from "@/lib/activePlan";
import { putThumb } from "@/lib/dbApi";
import { THUMB_H, THUMB_MAX_BYTES, THUMB_W, isBlankThumb, thumbSvg } from "@/lib/planThumb";
import { useStore } from "@/lib/store";

const FIRST_MS = 4000; // after a plan appears on screen: the store has loaded it by then
const QUIET_MS = 30_000; // after the last edit: nobody uploads a picture of a plan that is still being drawn
const DRAG_RETRY_MS = 3000;

/** The plan's picture as a WebP, or null when this browser cannot make one (Safari makes PNGs: the plan list then draws the picture itself). */
async function toWebp(svg: string): Promise<Blob | null> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = THUMB_W;
    canvas.height = THUMB_H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/webp", 0.8));
    return blob && blob.type === "image/webp" && blob.size <= THUMB_MAX_BYTES ? blob : null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Keeps the active plan's picture on the server for the plan list: drawn (lib/planThumb) and uploaded 30 s after the last edit, and only when the
 * picture is not the one already sent. Never while a drag is going, the tab is hidden or the screensaver is up. A plan whose picture the server
 * already has is trusted on first sight, so reloading a wall display uploads nothing.
 */
function useThumbUpload() {
  useEffect(() => {
    const sent = new Map<number, string>(); // plan id -> the picture the server has (as far as this page knows)
    let timer: ReturnType<typeof setTimeout> | undefined;
    let busy = false;

    const schedule = (ms: number) => {
      clearTimeout(timer);
      timer = setTimeout(() => void run(), ms);
    };

    const run = async () => {
      const { id, list, status } = useActivePlan.getState();
      if (busy) return schedule(QUIET_MS);
      if (id === null || status !== "ready" || !list) return schedule(FIRST_MS);
      if (document.hidden || document.documentElement.hasAttribute("data-saver")) return schedule(QUIET_MS);
      const s = useStore.getState();
      if (s.gesture) return schedule(DRAG_RETRY_MS);
      const mine = list.find((d) => d.id === id);
      const svg = thumbSvg(s.plan);
      if (!mine || isBlankThumb(svg)) return;
      const known = sent.get(id);
      if (known === svg) return;
      sent.set(id, svg);
      if (known === undefined && mine.thumbRev > 0) return;
      busy = true;
      try {
        const webp = await toWebp(svg);
        if (webp) await putThumb(id, webp); // the 15 s refresh of the plan list brings the new thumbRev
      } catch {
        sent.delete(id); // only a picture: try again at the next edit or the next visit
      } finally {
        busy = false;
      }
    };

    const stopStore = useStore.subscribe((s, prev) => {
      if (s.plan === prev.plan) return;
      const id = useActivePlan.getState().id;
      schedule(id !== null && sent.has(id) ? QUIET_MS : FIRST_MS); // a plan arriving on screen is not an edit: its first look comes soon
    });
    const stopPlans = useActivePlan.subscribe((s, prev) => { if (s.id !== prev.id) schedule(FIRST_MS); });
    schedule(FIRST_MS);
    return () => {
      clearTimeout(timer);
      stopStore();
      stopPlans();
    };
  }, []);
}

/** The tab title: "<plan name> - Doshy". */
function useTitle() {
  const name = useActivePlan((s) => s.list?.find((d) => d.id === s.id)?.name);
  useEffect(() => {
    document.title = name ? `${name} - Doshy` : "Doshy";
  }, [name]);
}

/** Everything the page does because several plans exist: the tab title and the picture upload. Mounted once, by the dashboard. */
export default function usePlanEffects() {
  useTitle();
  useThumbUpload();
}
