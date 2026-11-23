"use client";
import { useEffect, useRef } from "react";
import { useStore } from "@/lib/store";
import { cycleEnded, finishNote, isWashLike, washdataOf, washView, type WashState } from "@/lib/washdata";
import { useInbox } from "./inboxStore";

/**
 * Says "Washing Machine is done" once, through the notification toast, when a washer, dryer or dishwasher on the plan goes from a cycle under way to done while the
 * dashboard is open. The first reading after a page load never counts (nothing earlier to compare with), a dropped connection keeps the earlier reading, and an item
 * switches it off with `params.washNotify: false`. Renders nothing.
 */
export default function WashWatch() {
  const items = useStore((s) => s.plan.items);
  const states = useStore((s) => s.states);
  const last = useRef<Record<string, WashState>>({});
  useEffect(() => {
    const devices = new Map<string, { anchor: string; notify: boolean }>(); // one entry per device, even when several items link to it
    for (const it of items) {
      const dev = isWashLike(it.entity) ? washdataOf(states, it.entity) : undefined;
      if (dev) devices.set(dev.base, { anchor: dev.anchor, notify: (devices.get(dev.base)?.notify ?? false) || it.params?.washNotify !== false });
    }
    for (const [base, { anchor, notify }] of devices) {
      const v = washView(states, base);
      if (v.state === "unavailable") continue;
      const before = last.current[base];
      last.current[base] = v.state;
      if (notify && cycleEnded(before, v.state)) useInbox.setState({ toast: { id: `wash:${base}:${Date.now()}`, created_at: new Date().toISOString(), entity: anchor, ...finishNote(v) } });
    }
  }, [items, states]);
  return null;
}
