"use client";
import { HouseIcon, MoonIcon, WarningIcon } from "@phosphor-icons/react";
import { useEffect, useMemo } from "react";
import type { Alert } from "@/lib/alerts";
import { chipText, fmtDay, hm, nextUp } from "@/lib/calendar";
import { openOpenings } from "@/lib/openings";
import { roomSummary } from "@/lib/rooms";
import { useStore } from "@/lib/store";
import { useHouseDay, useHouseLive, useLiveRooms } from "@/lib/useLive";
import { useDisplay } from "@/lib/displayStore";
import { usePressure } from "@/lib/usePressure";
import { useSky } from "@/lib/useSky";
import { homeText, openText, powerText, pressureLine, weatherText } from "@/lib/wallFacts";
import { useCalendar } from "../ui/calendarStore";
import { WEATHER_ICON } from "../ui/TelemetryBar";
import { useNow } from "../useNow";

const CLOCK_TICK_MS = 20_000; // the clock shows minutes: no need to wake the Pi every second

/** One fact on a card: a small label over a plain sentence. */
function Fact({ label, children }: { label: string; children: string }) {
  return (
    <div className="wall-fact">
      <span className="wall-fact-label">{label}</span>
      <span className="wall-fact-text">{children}</span>
    </div>
  );
}

const temp = (v: number | undefined): string | null => (v === undefined ? null : `${Math.round(v)}°`);

/** Big clock, the date, and the weather outside in one line. */
export function ClockSlide() {
  const now = useNow(CLOCK_TICK_MS);
  const sky = useSky();
  const house = useHouseLive();
  const outside = temp(house.outsideTemp ?? sky.weather.temp);
  const Glyph = sky.weather.kind === "clear" && sky.phase === "night" ? MoonIcon : WEATHER_ICON[sky.weather.kind];
  const inside = house.meanTemp === undefined ? null : `${house.meanTemp.toFixed(1)}°`;
  const { reading, tendency } = usePressure();
  const pressure = pressureLine(reading, tendency, useDisplay((s) => s.pressureUnit));
  return (
    <div className="wall-card wall-clock">
      <span className="wall-time">{hm(new Date(now))}</span>
      <span className="wall-day">{fmtDay(new Date(now))}</span>
      <span className="wall-weather">
        <Glyph size={28} aria-hidden />
        {weatherText(sky.weather.kind, sky.phase === "night")}
        {outside && ` · ${outside} outside`}
        {inside && ` · ${inside} inside`}
      </span>
      {pressure && <span className="wall-weather">{pressure}</span>}
    </div>
  );
}

/** What is going on in the house, in plain sentences: power, doors and windows, who is home, the next event. Anything the home does not report is left out. */
export function HouseSlide() {
  const plan = useStore((s) => s.plan);
  const states = useStore((s) => s.states);
  const house = useHouseLive();
  const { todayKwh } = useHouseDay();
  const upcoming = useCalendar((s) => s.upcoming);
  const now = useNow(CLOCK_TICK_MS);
  useEffect(() => void useCalendar.getState().loadUpcoming(), []);

  const open = useMemo(() => openOpenings(plan, states).map((o) => String(states[o.entity]?.attributes.friendly_name ?? o.entity)), [plan, states]);
  const people = homeText(house.persons);
  const next = nextUp(upcoming, now);
  const power = house.powerW === undefined ? null : `${powerText(house.powerW)}${todayKwh === undefined ? "" : `, ${todayKwh.toFixed(1)} kWh today`}`;
  const hasOpenData = plan.openings.some((o) => o.entity);
  return (
    <div className="wall-card wall-house">
      <h2 className="wall-title"><HouseIcon size={22} aria-hidden />House now</h2>
      <div className="wall-facts">
        {power && <Fact label="Power">{power}</Fact>}
        {hasOpenData && <Fact label="Doors and windows">{openText(open)}</Fact>}
        {people && <Fact label="Who is home">{people}</Fact>}
        {next && <Fact label="Next event">{chipText(next, now)}</Fact>}
        {!power && !people && !next && !hasOpenData && <Fact label="Home Assistant">Nothing to report yet.</Fact>}
      </div>
    </div>
  );
}

/** The strip under a room or the whole-home view: its name and what its sensors say. */
export function SceneCaption({ roomId }: { roomId: string | null }) {
  const plan = useStore((s) => s.plan);
  const states = useStore((s) => s.states);
  const live = useLiveRooms();
  const room = roomId ? plan.rooms.find((r) => r.id === roomId) : undefined;
  if (!room) return <div className="wall-caption"><span className="wall-name">Your home</span></div>;
  const sum = roomSummary(plan, states, room);
  const l = live[room.parent ?? room.id];
  const bits = [
    l?.temp ? `${Number(l.temp.value).toFixed(1)}${l.temp.unit}` : null,
    l?.humidity ? `${Math.round(l.humidity.value)}${l.humidity.unit} humidity` : null,
    sum.lights.total > 0 ? `${sum.lights.on} of ${sum.lights.total} lights on` : null,
    l?.presence === true ? "Someone is here" : null,
    l?.powerW !== undefined && l.powerW >= 1 ? powerText(l.powerW) : null,
  ].filter((b): b is string => b !== null);
  return (
    <div className="wall-caption">
      <span className="wall-name">{room.name}</span>
      {bits.length > 0 && <span className="wall-bits">{bits.join(" · ")}</span>}
    </div>
  );
}

/** An alert holds the screen: red, big, in words. `scene`: the room is behind it, so only a strip. */
export function AlertSlide({ alert, scene }: { alert: Alert | undefined; scene: boolean }) {
  if (!alert) return null;
  return (
    <div className={scene ? "wall-caption wall-alert" : "wall-card wall-alert"} role="alert">
      <WarningIcon size={scene ? 26 : 56} weight="fill" aria-hidden />
      <span className="wall-name">{alert.title}</span>
      <span className="wall-bits">{alert.roomName ? `${alert.roomName}: ${alert.message}` : alert.message}</span>
      <span className="wall-hint">Touch the screen to answer it</span>
    </div>
  );
}
