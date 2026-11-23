"use client";
import { useEffect, useMemo } from "react";
import { Color } from "three";
import { create } from "zustand";
import { CATALOG } from "@/lib/catalog";
import { runStatus, thresholdsFor, toWatts, familyOf, pushWatts, type Family, type RunStatus, type Sample } from "@/lib/running";
import { classifySensor, type SensorInfo } from "@/lib/sensors";
import { useStore, usePoll } from "@/lib/store";
import { fetchHistory } from "@/lib/stats";
import type { Item } from "@/lib/types";
import { badgeOf, isWashLike, washColor, washdataOf, washView, type WashBadge, type WashView } from "@/lib/washdata";

const KEEP_MS = 3 * 3_600_000; // how much power history the run detector keeps and fetches
const HISTORY_POINTS = 400;

/** Recent watts of every plug power sensor in use: live readings pushed at each poll, earlier ones from /api/ha/history. */
const useWatts = create<{ buf: Record<string, Sample[]> }>(() => ({ buf: {} }));
const tracked = new Set<string>();
let wired = false;

function wire() {
  if (wired) return;
  wired = true;
  usePoll.subscribe(() => { // every poll, even an unchanged one: a steady reading still has to build up a run
    const { states } = useStore.getState();
    const now = Date.now();
    useWatts.setState(({ buf }) => {
      const next = { ...buf };
      for (const id of tracked) {
        const st = states[id];
        const w = st && toWatts(st.state, st.attributes.unit_of_measurement);
        if (w != null) next[id] = pushWatts(next[id] ?? [], now, w, KEEP_MS);
      }
      return { buf: next };
    });
  });
}

function track(entity: string) {
  wire();
  if (tracked.has(entity)) return;
  tracked.add(entity);
  const unit = useStore.getState().states[entity]?.attributes.unit_of_measurement;
  // History is an extra: without it (no recorder, request failed) the live buffer alone still detects a run, just from "now" on.
  fetchHistory([entity], KEEP_MS / 3_600_000, { points: HISTORY_POINTS })
    .then((r) => {
      const s = r.series[entity];
      if (s?.kind !== "num") return;
      const old = s.t.map((t, i) => ({ t, w: toWatts(String(s.v[i]), unit) ?? 0 }));
      useWatts.setState(({ buf }) => {
        const live = buf[entity] ?? [];
        const first = live[0]?.t ?? Infinity;
        return { buf: { ...buf, [entity]: [...old.filter((p) => p.t < first), ...live] } };
      });
    })
    .catch(() => tracked.delete(entity)); // retried the next time an item with this plug mounts
}

export type RunLive = {
  family: Family;
  status: RunStatus;
  watts: number | null;
  running: boolean;
  tint?: Color; // glow colour while running
  steam: boolean; // kettle / coffee machine
  flicker: boolean; // TV
  pulse: boolean; // dishwasher
};

/** An item linked to a WashData device: its normalised view, the marker text and the glow colour. */
export type WashLive = { view: WashView; badge: WashBadge; tint: Color };

export type ItemLive = { sensor?: SensorInfo; run?: RunLive; wash?: WashLive };

const FLAVOUR: Partial<Record<Family, { tint: string; steam?: boolean; flicker?: boolean; pulse?: boolean }>> = {
  dryer: { tint: "#ffb066" },
  dishwasher: { tint: "#4aa3ff", pulse: true },
  kettle: { tint: "#ffc27a", steam: true },
  coffee: { tint: "#ffb868", steam: true },
  tv: { tint: "#8fbaff", flicker: true },
  printer: { tint: "#5ad7ff" },
  dehumidifier: { tint: "#8fd3ff" },
};

const text = (v: unknown) => (typeof v === "string" && v ? v : undefined);

/** The recent watts of a power sensor (live readings plus fetched history), starting to collect them on first use. */
export function useRecentWatts(entity?: string): Sample[] | undefined {
  const buf = useWatts((s) => (entity ? s.buf[entity] : undefined));
  useEffect(() => {
    if (entity) track(entity);
  }, [entity]);
  return buf;
}

/**
 * What an item's Home Assistant link means beyond on / off: a sensor reading (item.entity is a sensor), or "is it running"
 * for an appliance on a smart plug (item.params.powerEntity, plus plugEntity and runAbove), worked out from the power draw. An item linked to any entity of a
 * WashData device (lib/washdata.ts) gets that device's own view instead, which wins over a plug.
 */
export function useItemLive(item: Item): ItemLive {
  const powerId = text(item.params?.powerEntity);
  const plugId = text(item.params?.plugEntity);
  const runAbove = typeof item.params?.runAbove === "number" ? item.params.runAbove : undefined;
  const st = useStore((s) => (item.entity ? s.states[item.entity] : undefined));
  const power = useStore((s) => (powerId ? s.states[powerId] : undefined));
  const plug = useStore((s) => (plugId ? s.states[plugId] : undefined));
  const buf = useRecentWatts(powerId);
  // only an entity that looks like a WashData one watches every state; any other item keeps its cheap, per-entity subscription
  const washStates = useStore((s) => (isWashLike(item.entity) ? s.states : undefined));
  const wash = useMemo<WashLive | undefined>(() => {
    const dev = washStates && washdataOf(washStates, item.entity);
    if (!dev) return undefined;
    const view = washView(washStates, dev.base);
    return { view, badge: badgeOf(view), tint: new Color(washColor(view)) };
  }, [washStates, item.entity]);

  const kind = item.kind;
  const family = useMemo(() => familyOf(`${kind} ${CATALOG[kind]?.label ?? ""}`), [kind]);
  return useMemo(() => {
    if (wash) return { wash };
    const sensor = classifySensor(st) ?? undefined;
    if (!powerId) return { sensor };
    const watts = power ? toWatts(power.state, power.attributes.unit_of_measurement) : null;
    const switchOn = plug && plug.state !== "unavailable" && plug.state !== "unknown" ? plug.state === "on" : undefined;
    const status = runStatus({ powerW: watts, switchOn, thresholds: thresholdsFor(family, runAbove), history: buf });
    const f = FLAVOUR[family];
    return { sensor, run: { family, status, watts, running: status.state === "running", tint: f && new Color(f.tint), steam: !!f?.steam, flicker: !!f?.flicker, pulse: !!f?.pulse } };
  }, [wash, st, power, plug, buf, powerId, family, runAbove]);
}
