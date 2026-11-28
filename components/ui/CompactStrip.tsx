"use client";
import { HouseIcon, LightbulbIcon, ListIcon, MoonIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useHomeLabel } from "@/lib/homes";
import { useStore } from "@/lib/store";
import { useHouseLive } from "@/lib/useLive";
import { useSky } from "@/lib/useSky";
import type { HaStatus } from "./Brand";
import CalendarChip from "./CalendarChip";
import { useChromeUi } from "./chromeUi";
import InboxChip from "./InboxChip";
import LaundryChip from "./LaundryChip";
import { Equaliser } from "./MediaBits";
import { useMediaUi } from "./mediaUi";
import { OpenChip } from "./StatusChips";
import { PlanChip } from "./PlanSwitcher";
import { PressureStripItem } from "./PressureBits";
import { WEATHER_ICON } from "./TelemetryBar";
import "./compactChrome.css";
import "./homeChip.css";

const STATUS_TEXT: Record<HaStatus, string> = { loading: "linking", online: "online", offline: "offline" };

/** HH:MM, refreshed every few seconds. Empty until mounted so the server markup stays stable. */
function Clock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 5000);
    return () => clearInterval(t);
  }, []);
  return <time className="cs-clock">{now ? now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "--:--"}</time>;
}

/**
 * The always-on top strip of the compact layout: Home Assistant state, the time, the numbers you glance at on a wall display (outside and inside temperature, power, lights on),
 * alerts (open windows, notifications) and the Menu button. Tapping the numbers opens the "house now" card. Calendar and inbox keep polling from here.
 */
export default function CompactStrip({ status, lit, total, live }: { status: HaStatus; lit: number; total: number; live: boolean }) {
  const sky = useSky();
  const home = useHomeLabel(); // null while there is only one home
  const house = useHouseLive();
  const menu = useChromeUi((s) => s.menu);
  const plansOpen = useChromeUi((s) => s.plans);
  const houseOpen = useChromeUi((s) => s.house);
  const mediaOpen = useMediaUi((s) => s.open);
  const playing = useStore((s) => Object.values(s.states).some((e) => e.entity_id.startsWith("media_player.") && (e.state === "playing" || e.state === "buffering")));

  const w = sky.weather;
  const Glyph = w.kind === "clear" && sky.phase === "night" ? MoonIcon : WEATHER_ICON[w.kind];
  const outside = house.outsideTemp ?? w.temp;
  const out = outside === undefined ? "--" : `${Math.round(outside)}°`;
  const inside = house.meanTemp === undefined ? "--" : `${house.meanTemp.toFixed(1)}°`;
  const power = house.powerW === undefined ? undefined : Math.round(house.powerW);
  const summary = `Outside ${out === "--" ? "unknown" : `${out} C`}, inside ${inside === "--" ? "unknown" : `${inside} C`}${power === undefined ? "" : `, ${power} watts`}`;

  return (
    <header className="cstrip hud" data-live={live} role="toolbar" aria-label="Status and menu">
      <span className={`cs-ha ${status}`} role="status" aria-label={`Home Assistant ${STATUS_TEXT[status]}${home ? `, ${home}` : ""}`} title={home ?? undefined}>
        <i className="dot" aria-hidden />
        {status !== "online" && <span className="cs-ha-text">{STATUS_TEXT[status]}</span>}
        {home && <span className="cs-ha-home">{home}</span>}
      </span>
      <Clock />
      <PlanChip compact open={plansOpen} onClick={() => useChromeUi.getState().setPlans(!plansOpen)} />
      {live && (
        <button type="button" className="cs-house" aria-expanded={houseOpen} aria-label={`${summary}. Open the house card`} onClick={() => useChromeUi.getState().setHouse(!houseOpen)}>
          <span className="cs-item"><Glyph size={20} aria-hidden /><b>{out}</b><small>out</small></span>
          <span className="cs-item"><HouseIcon size={20} aria-hidden /><b>{inside}</b><small>in</small></span>
          <PressureStripItem />
          {power !== undefined && <span className="cs-item cs-power"><b>{power}</b><small>W</small></span>}
        </button>
      )}
      {live && total > 0 && (
        <span className="cs-item cs-lights" role="img" aria-label={`${lit} of ${total} lights on`}>
          <LightbulbIcon size={20} aria-hidden /><b>{lit}<i>/</i>{total}</b>
        </span>
      )}
      <span className="cs-gap" />
      {live && <OpenChip />}
      {live && <LaundryChip max={1} />}
      {playing && (
        <button type="button" className="t-btn cs-media" aria-pressed={mediaOpen} aria-label="Media: something is playing. Open the player" onClick={() => useMediaUi.getState().toggle()}>
          <Equaliser playing size={20} />
        </button>
      )}
      <CalendarChip />
      <InboxChip />
      <button type="button" className="t-btn cs-menu" aria-expanded={menu} aria-label="Menu" onClick={() => useChromeUi.getState().setMenu(!menu)}>
        <ListIcon size={26} aria-hidden />
      </button>
    </header>
  );
}
