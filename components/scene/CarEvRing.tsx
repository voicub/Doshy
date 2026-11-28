"use client";
import { useMemo, type CSSProperties } from "react";
import { isCarKind } from "@/lib/cars";
import { carSoc } from "@/lib/energyCar";
import { evCar } from "@/lib/energyLayout";
import { isIdle, formatPower } from "@/lib/flows";
import { floorY, levelIdOf } from "@/lib/levels";
import { useStore } from "@/lib/store";
import { useEnergyNow, useEnergySources } from "@/lib/useEnergy";
import { Marker } from "./DeclutterLayer";
import { useLevelVisibility } from "./levelState";
import "./energyFlow.css";

const RING_R = 16;
const LOW_PCT = 20;
/** How far above the car's roof the ring floats (m). */
const ABOVE_ROOF = 0.35;
const LOW = "var(--lg-ff7a45)";
const OK = "var(--accent)";

/** A battery ring: an arc as long as the charge, the percent in the middle, and (while the charger delivers power) what it delivers. */
function Ring({ pct, chargingW }: { pct: number; chargingW?: number }) {
  const text = chargingW === undefined ? undefined : `charging ${formatPower(chargingW)}`;
  return (
    <span className="ef-ring" style={{ "--fc": pct < LOW_PCT ? LOW : OK } as CSSProperties} role="img" aria-label={`Car battery ${Math.round(pct)} percent${text ? `, ${text}` : ""}`}>
      <svg viewBox="0 0 40 40" width={40} height={40} aria-hidden>
        <circle cx={20} cy={20} r={RING_R} fill="none" stroke="currentColor" strokeOpacity={0.25} strokeWidth={4} />
        <circle cx={20} cy={20} r={RING_R} fill="none" stroke="currentColor" strokeWidth={4} pathLength={100} strokeDasharray={`${pct} 100`} transform="rotate(-90 20 20)" />
      </svg>
      <b>{Math.round(pct)}</b>
      {text && <small>{text}</small>}
    </span>
  );
}

/**
 * A battery ring above each car that is linked to a Home Assistant entity (its tracker), when the car's charge is known: from the sensor picked in the
 * energy sources, else the tracker's `battery_level`, else a matching battery sensor. Shown with the Power layer, or while the charger is working.
 * No animation.
 */
export default function CarEvRing({ power }: { power: boolean }) {
  const plan = useStore((s) => s.plan);
  const states = useStore((s) => s.states);
  const sources = useEnergySources();
  const now = useEnergyNow();
  const { visible } = useLevelVisibility();
  const cars = useMemo(() => plan.items.flatMap((i) => (isCarKind(i.kind) && i.entity ? [{ item: i, entity: i.entity }] : [])), [plan.items]);
  const charging = now.available.ev && !isIdle(now.evW);
  if (!cars.length || !(power || charging)) return null;
  const charged = evCar(plan)?.id; // the charger feeds the first linked car
  return (
    <>
      {cars.map(({ item, entity }) => {
        const soc = carSoc(sources, entity, states);
        if (soc === undefined || !visible[levelIdOf(plan, item)]) return null;
        const y = floorY(plan, item) + (item.elev ?? 0) + Math.max(item.h, 1.2) + ABOVE_ROOF;
        return (
          <Marker key={item.id} id={`energy:car:${item.id}`} kind="ring" position={[item.x, y, item.y]}>
            <Ring pct={soc} chargingW={charging && item.id === charged ? now.evW : undefined} />
          </Marker>
        );
      })}
    </>
  );
}
