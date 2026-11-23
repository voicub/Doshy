"use client";
import { initials, sinceLabel, type HouseLive, type Line, type RoomLive } from "@/lib/live";
import type { Room } from "@/lib/types";
import LiveNumber from "./LiveNumber";
import MonoLabel from "./MonoLabel";
import Sparkline from "./Sparkline";

/** A flat series draws as an empty trace instead of a line glued to the bottom. */
const moving = (l?: Line) => (l && l.v.length > 1 && Math.max(...l.v) > Math.min(...l.v) ? l : undefined);

/** The one-line summary shown while the bar is collapsed: power, mean temperature, who is home. */
export function CollapsedSummary({ house }: { house: HouseLive }) {
  const home = house.persons.filter((p) => p.home);
  return (
    <span className="lb-sum" aria-label="Summary">
      <span>{house.powerW === undefined ? "--" : Math.round(house.powerW)} <small>W</small></span>
      <span>{house.meanTemp === undefined ? "--" : house.meanTemp.toFixed(1)} <small>°C</small></span>
      <span>{home.length ? home.map((p) => initials(p.name)).join(" ") : "--"}</span>
    </span>
  );
}

/** House power with its trace, the meter against the 24 h peak, and today's energy. */
export function PowerBlock({ house, history, todayKwh, peak }: { house: HouseLive; history: Line | undefined; todayKwh: number | undefined; peak: number | undefined }) {
  return (
    <>
      <div className="lb-row">
        <div className="lb-big">
          <MonoLabel>House power</MonoLabel>
          <b><LiveNumber value={house.powerW} /><i>W</i></b>
        </div>
        <Sparkline line={moving(history)} width={132} height={34} />
      </div>
      <div>
        <div className="lb-meter" role="meter" aria-label="House power relative to the 24 hour peak" aria-valuemin={0} aria-valuemax={peak ?? 0} aria-valuenow={house.powerW ?? 0}>
          <i style={{ width: `${house.powerW !== undefined && peak ? Math.min(100, (house.powerW / peak) * 100) : 0}%` }} />
        </div>
        <div className="lb-sub" style={{ marginTop: 6 }}>
          <span>{todayKwh === undefined ? "Today --" : `Today ${todayKwh.toFixed(1)} kWh`}</span>
          <span>{peak === undefined ? "24h peak --" : `24h peak ${Math.round(peak)} W`}</span>
        </div>
      </div>
    </>
  );
}

export function ClimatePair({ house }: { house: HouseLive }) {
  return (
    <div className="lb-pair">
      <div>
        <MonoLabel>Indoor</MonoLabel>
        <span className="lb-v"><span><LiveNumber value={house.meanTemp} digits={1} />°C</span><span><LiveNumber value={house.meanHumidity} />%</span></span>
      </div>
      <div>
        <MonoLabel>Outside</MonoLabel>
        <span className="lb-v"><span><LiveNumber value={house.outsideTemp} digits={1} />°C</span><span><LiveNumber value={house.outsideHumidity} />%</span></span>
      </div>
    </div>
  );
}

export function PeopleRow({ persons }: { persons: HouseLive["persons"] }) {
  return (
    <div className="lb-people" role="list" aria-label="People">
      <MonoLabel>People</MonoLabel>
      {persons.map((p) => (
        <span key={p.entity} role="listitem" className={`lb-person ${p.home ? "" : "away"}`} title={`${p.name}: ${p.home ? "home" : "away"}`} aria-label={`${p.name}: ${p.home ? "home" : "away"}`}>
          {initials(p.name)}
        </span>
      ))}
    </div>
  );
}

/** One tile per room that has a sensor: temperature, humidity, occupancy and a trend. */
export function RoomTiles({ tiles, rooms, history }: { tiles: Room[]; rooms: Record<string, RoomLive>; history: Record<string, Line> }) {
  return (
    <div className="lb-tiles" role="list" aria-label="Rooms">
      {tiles.map((r) => {
        const l = rooms[r.id];
        const occ = l.presence;
        const tip = occ == null || l.presenceSince === undefined ? "" : `${occ ? "OCCUPIED" : "EMPTY"} ${sinceLabel(l.presenceSince, Date.now())}`;
        return (
          <div key={r.id} role="listitem" className="lb-tile" aria-label={`${r.name}${l.temp ? `, ${l.temp.value.toFixed(1)}${l.temp.unit}` : ""}${l.humidity ? `, ${Math.round(l.humidity.value)}% humidity` : ""}${occ == null ? "" : occ ? ", occupied" : ", empty"}`}>
            <span>
              <em>{r.name}</em>
              {occ != null && <i className={`occ ${occ ? "on" : ""}`} title={tip} />}
            </span>
            <div>
              <b data-c={l.tempComfort}>{l.temp ? <><LiveNumber value={l.temp.value} digits={1} />{l.temp.unit}</> : "--"}</b>
              <small data-c={l.humidityComfort}>{l.humidity ? <><LiveNumber value={l.humidity.value} />%</> : ""}</small>
            </div>
            <Sparkline line={moving(history[`t:${r.id}`])} width={110} height={12} />
          </div>
        );
      })}
    </div>
  );
}
