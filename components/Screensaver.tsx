"use client";
import { useEffect } from "react";
import { hm, chipText, fmtDay, nextUp } from "@/lib/calendar";
import { climateIds, climateInfo, roomTemps } from "@/lib/climate";
import { WAKE_EVENT } from "@/lib/display";
import { useDisplay } from "@/lib/displayStore";
import { useAreas } from "@/lib/haAreas";
import { useStore } from "@/lib/store";
import { useCalendar } from "./ui/calendarStore";
import { useNow } from "./useNow";
import "./screensaver.css";

const TICK_MS = 20_000; // the clock shows minutes: no need to wake the Pi every second

/** The room temperature: the first thermostat that reports one, else the first room sensor. */
function indoorTemp(): number | null {
  const { states, plan } = useStore.getState();
  for (const id of climateIds(states)) {
    const c = climateInfo(states[id]).current;
    if (typeof c === "number" && Number.isFinite(c)) return c;
  }
  const { entityArea, areas } = useAreas.getState();
  return roomTemps(plan, states, entityArea, areas)[0]?.value ?? null;
}

function facts(now: number) {
  const next = nextUp(useCalendar.getState().upcoming, now);
  const temp = indoorTemp();
  return { time: hm(new Date(now)), day: fmtDay(new Date(now)), temp: temp === null ? null : `${temp.toFixed(1)} °C`, next: next ? chipText(next, now) : null };
}

function Clock() {
  const f = facts(useNow(TICK_MS));
  useEffect(() => void useCalendar.getState().loadUpcoming(), []);
  return (
    <>
      <span className="saver-time">{f.time}</span>
      <span className="saver-day">{f.day}</span>
      {f.temp && <span className="saver-line">Indoor {f.temp}</span>}
      {f.next && <span className="saver-line saver-next">{f.next}</span>}
    </>
  );
}

/** The screensaver: a dark full-screen cover (calm clock, room temperature, next event) while the idle timer says so (components/KioskTouch.tsx). A touch or a key wakes it. */
export default function Screensaver() {
  const idle = useDisplay((s) => s.idle);
  const style = useDisplay((s) => s.style);
  if (!idle) return null;
  return (
    <button type="button" className="saver" data-style={style} aria-label="Screensaver. Touch to wake up." onClick={() => window.dispatchEvent(new Event(WAKE_EVENT))} autoFocus>
      {style === "clock" && <Clock />}
    </button>
  );
}
