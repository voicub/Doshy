"use client";
import { useMemo } from "react";
import { useSkySettings } from "@/lib/sky";
import { useStore } from "@/lib/store";
import { useSky } from "@/lib/useSky";
import { useReducedMotion } from "../motion";
import { baseElevation } from "@/lib/stairs";
import { findAnchors } from "./anchors";
import DecorBatch from "./decor/DecorBatch";
import { Bats, Confetti, Fireworks, Hearts } from "./decor/Effects";
import { buildHolidayAt } from "./decor/builders";

/** Decor reaches full size at this holiday strength (Christmas holds 0.6 outside its peak days), then fades down toward the window edges. */
const FULL_AT = 0.6;
const FADE_STEPS = 20; // the fade is quantised so the parts are re-laid at most this many times per fade

/**
 * Holiday decoration anchored to the flat: the balcony and its railings, the entrance door, the window frames and, in the
 * garden environment, the lawn. Pieces are batched into a few instanced meshes; glowing parts bloom; nothing takes pointer events.
 */
export default function HolidayDecor() {
  const plan = useStore((s) => s.plan);
  const garden = useStore((s) => s.environment) === "garden";
  const sky = useSky();
  const forced = useSkySettings((s) => s.holidayMode) !== "auto";
  const reduced = useReducedMotion();
  const id = sky.holiday?.id ?? null;
  const fade = Math.round(Math.min(1, (sky.holiday?.strength ?? 0) / FULL_AT) * FADE_STEPS) / FADE_STEPS;
  const snowing = sky.weather.kind === "snow";
  const elev = baseElevation(plan);
  const anchors = findAnchors(plan);
  const signature = JSON.stringify(anchors);
  const stable = useMemo(() => anchors, [signature]); // re-laid only when the building, balcony, railings or openings changed
  const batch = useMemo(() => (id ? buildHolidayAt(id, { a: stable, garden, snowing }, elev) : null), [id, stable, garden, snowing, elev]);
  const rooms = useMemo(() => plan.rooms.map((r) => [r.x, r.y, r.x + r.w, r.y + r.h]), [plan.rooms]);

  if (!id || !batch || fade <= 0) return null;
  return (
    <group>
      <DecorBatch batch={batch} fade={fade} reduced={reduced} />
      {id === "HALLOWEEN" && <Bats a={stable} fade={fade} reduced={reduced} />}
      {!reduced && id === "VALENTINE" && <Hearts a={stable} fade={fade} />}
      {!reduced && id === "NEW_YEAR" && (
        <>
          <Fireworks a={stable} forced={forced} fade={fade} />
          <Confetti a={stable} rooms={rooms} fade={fade} />
        </>
      )}
    </group>
  );
}
