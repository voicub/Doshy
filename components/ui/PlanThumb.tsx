"use client";
import { useEffect, useRef, useState } from "react";
import { fetchPlan, thumbUrl, type Dashboard } from "@/lib/dbApi";
import { asPlan, thumbSvg } from "@/lib/planThumb";
import { PlanGlyph } from "./planUi";

/** Pictures drawn from a plan's JSON, by plan id and revision: a plan that did not change is never fetched or drawn twice. */
const drawn = new Map<string, string>();
const MAX_DRAWN = 40;

// One plan at a time: a plan can be megabytes, and a Raspberry Pi should not parse eight of them at once.
let queue: Promise<unknown> = Promise.resolve();

async function draw(d: Dashboard): Promise<string | null> {
  const key = `${d.id}:${d.rev}`;
  const have = drawn.get(key);
  if (have) return have;
  const reply = await fetchPlan(d.id);
  const plan = "plan" in reply && reply.plan !== null ? asPlan(reply.plan) : null;
  if (!plan) return null;
  const url = `data:image/svg+xml,${encodeURIComponent(thumbSvg(plan))}`;
  if (drawn.size >= MAX_DRAWN) drawn.delete(drawn.keys().next().value ?? key);
  drawn.set(key, url);
  return url;
}

const enqueue = (d: Dashboard): Promise<string | null> => {
  const next = queue.then(() => draw(d));
  queue = next.catch(() => undefined); // one failed plan must not stop the others
  return next;
};

/**
 * A plan's picture. The server's picture when the plan has one (a small cached image); else, once the tile scrolls into view and only when `draw` is set,
 * the plan is fetched and drawn here (`lib/planThumb`), which also works for plans that were never opened on a screen. Otherwise the plan's icon on a tile.
 */
export default function PlanThumb({ d, draw: mayDraw = false }: { d: Dashboard; draw?: boolean }) {
  const box = useRef<HTMLSpanElement>(null);
  const key = `${d.id}:${d.rev}`;
  const [made, setMade] = useState<{ key: string; src: string | null } | null>(null);
  const needsDrawing = d.thumbRev === 0 && mayDraw && d.rev > 0;

  useEffect(() => {
    const el = box.current;
    if (!needsDrawing || !el) return;
    let live = true;
    const look = new IntersectionObserver(([hit]) => {
      if (!hit?.isIntersecting) return;
      look.disconnect();
      enqueue(d).then((src) => live && setMade({ key, src }), () => live && setMade({ key, src: null }));
    });
    look.observe(el);
    return () => {
      live = false;
      look.disconnect();
    };
    // `d` as a whole changes on every list refresh; the id and revision are what decide whether the picture is out of date
  }, [needsDrawing, key]);

  const src = d.thumbRev > 0 ? thumbUrl(d.id, d.thumbRev) : made?.key === key ? made.src : null;
  return (
    <span ref={box} className="pt" data-state={src ? "image" : "tile"}>
      {src ? <img src={src} alt="" width={320} height={200} loading="lazy" decoding="async" draggable={false} /> : <PlanGlyph icon={d.icon} color={d.color} size={28} />}
    </span>
  );
}
