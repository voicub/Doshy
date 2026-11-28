"use client";
import { useMemo } from "react";
import { formatCost, formatKwh, gridState, batteryState, roomShares, OTHER_ID } from "@/lib/energy";
import { formatPower, isIdle } from "@/lib/flows";
import { useStore } from "@/lib/store";
import { useEnergyNow, useEnergySources } from "@/lib/useEnergy";
import { useEnergyDay } from "@/lib/useEnergyDay";
import { useLiveRooms } from "@/lib/useLive";
import MonoLabel from "./MonoLabel";
import "./energyInsights.css";

/** How many rooms the "where it goes" list names. */
const TOP_ROOMS = 4;

function Row({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="en-row">
      <span>{label}</span>
      <b>{value}</b>
      {sub && <small>{sub}</small>}
    </div>
  );
}

/**
 * The live card of the picked energy sources: solar, what the house uses, grid, battery, car charger, what it costs now, self-consumption, today's
 * totals (from the kWh counters) and which rooms use the most. Only the rows that apply are shown.
 */
export default function EnergyInsights() {
  const sources = useEnergySources();
  const now = useEnergyNow();
  const plan = useStore((s) => s.plan);
  const live = useLiveRooms();
  const day = useEnergyDay(true);
  const { available: av } = now;

  const shares = useMemo(() => {
    const rooms = plan.rooms.flatMap((r) => (!r.parent && (live[r.id]?.powerW ?? 0) > 0 ? [{ id: r.id, watts: live[r.id]?.powerW ?? 0 }] : []));
    return roomShares(rooms, now.houseW).slice(0, TOP_ROOMS);
  }, [plan.rooms, live, now.houseW]);
  const nameOf = (id: string) => (id === OTHER_ID ? "Everything else" : (plan.rooms.find((r) => r.id === id)?.name ?? id));

  const grid = gridState(now);
  const battery = batteryState(now);
  const batteryWatts = formatPower(Math.max(now.batteryChargeW, now.batteryDischargeW));
  const today = [
    day.solarKwh !== undefined && <Row key="s" label="Solar made" value={formatKwh(day.solarKwh)} />,
    day.importKwh !== undefined && <Row key="i" label="Bought from grid" value={formatKwh(day.importKwh)} />,
    day.exportKwh !== undefined && <Row key="e" label="Sold to grid" value={formatKwh(day.exportKwh)} />,
    day.cost !== undefined && <Row key="c" label="Cost today" value={formatCost(day.cost, now.currency)} sub="what you bought, at your fixed price" />,
  ].filter(Boolean);

  return (
    <section className="en-card" aria-label="Energy right now">
      <MonoLabel>Right now</MonoLabel>
      <div className="en-rows">
        {sources.solar && <Row label="Solar" value={av.solar ? formatPower(now.solarW) : "n/a"} />}
        {now.houseW !== undefined && <Row label="House" value={formatPower(now.houseW)} sub={now.evW > 0 && !isIdle(now.evW) ? `plus ${formatPower(now.evW)} for the car` : undefined} />}
        {sources.grid && <Row label="Grid" value={!av.grid ? "n/a" : grid === "idle" ? "Idle" : `${formatPower(Math.max(now.importW, now.exportW))} ${grid}`} />}
        {(sources.battery || sources.batterySoc) && (
          <Row
            label="Battery"
            value={av.soc && now.socPct !== undefined ? `${Math.round(now.socPct)}%` : !av.battery ? "n/a" : battery === "idle" ? "Idle" : `${batteryWatts} ${battery}`}
            sub={av.soc && av.battery && battery !== "idle" ? `${batteryWatts} ${battery}` : undefined}
          />
        )}
        {sources.ev && <Row label="Car charger" value={av.ev ? formatPower(now.evW) : "n/a"} sub={av.ev && !isIdle(now.evW) ? "charging" : undefined} />}
        {now.costPerHour !== undefined && <Row label="Cost now" value={formatCost(now.costPerHour, now.currency, "/h")} sub={now.pricePerKwh !== undefined ? `at ${formatCost(now.pricePerKwh, now.currency, "/kWh")}` : undefined} />}
        {now.selfConsumptionPct !== undefined && <Row label="Self-consumption" value={`${Math.round(now.selfConsumptionPct)}%`} sub="of the solar power used at home" />}
      </div>
      {today.length > 0 && (
        <>
          <MonoLabel>Today</MonoLabel>
          <div className="en-rows">{today}</div>
        </>
      )}
      {shares.length > 0 && (
        <>
          <MonoLabel>Where it goes</MonoLabel>
          <ul className="en-shares">
            {shares.map((s) => (
              <li key={s.id}>
                <span>{nameOf(s.id)}</span>
                <i style={{ width: `${Math.max(2, Math.round(s.share * 100))}%` }} aria-hidden />
                <b>{Math.round(s.share * 100)}%</b>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
