"use client";
import { CaretDownIcon, CaretUpIcon, XIcon } from "@phosphor-icons/react";
import { useRef, useState } from "react";
import useReportInset from "./useReportInset";
import useSwipeClose from "./useSwipeClose";
import { useStore } from "@/lib/store";
import { useHouseDay, useHouseLive, useLiveHistory, useLiveRooms } from "@/lib/useLive";
import { LaundryRow } from "./LaundryChip";
import { ClimatePair, CollapsedSummary, PeopleRow, PowerBlock, RoomTiles } from "./LiveBarParts";
import MonoLabel from "./MonoLabel";
import "./live.css";

/** Whole-flat live HUD: power with a 5-minute trace, indoor / outside climate, people, and a tile per room that has sensors. `sheet`: the compact layout's "house now" card (always open, closed with its X). */
export default function LiveBar({ sheet }: { sheet?: () => void } = {}) {
  // collapsed by default on narrow (tablet portrait / phone) screens, where it would cover the scene and the dock
  const [openState, setOpen] = useState(() => typeof window === "undefined" || window.matchMedia("(min-width: 901px)").matches);
  const open = !!sheet || openState;
  const root = useRef<HTMLElement>(null);
  useReportInset(root, !!sheet);
  const swipe = useSwipeClose(() => sheet?.());
  const plan = useStore((s) => s.plan);
  const house = useHouseLive();
  const rooms = useLiveRooms();
  const history = useLiveHistory();
  const { todayKwh, maxW } = useHouseDay();

  const tiles = plan.rooms.filter((r) => !r.parent && (rooms[r.id]?.temp || rooms[r.id]?.humidity || rooms[r.id]?.presence != null));
  const peak = house.powerW === undefined ? maxW : Math.max(maxW ?? 0, house.powerW);

  return (
    <aside ref={root} className={`hud livebar brackets${sheet ? " csheet" : ""}`} data-open={open} aria-label={sheet ? "House now" : "Live statistics"}>
      <div className="lb-head" {...(sheet ? swipe : {})}>
        <MonoLabel>{sheet ? "House now" : "Live"}</MonoLabel>
        {!open && <CollapsedSummary house={house} />}
        {sheet ? (
          <button className="icon-btn csheet-close" style={{ marginLeft: "auto" }} aria-label="Close house card" onClick={sheet}><XIcon size={18} /></button>
        ) : (
          <button className="icon-btn" style={{ marginLeft: open ? "auto" : 0 }} aria-expanded={open} aria-label={open ? "Collapse live statistics" : "Expand live statistics"} onClick={() => setOpen(!open)}>
            {open ? <CaretDownIcon size={14} /> : <CaretUpIcon size={14} />}
          </button>
        )}
      </div>
      {open && (
        <>
          <PowerBlock house={house} history={history.house} todayKwh={todayKwh} peak={peak} />
          <ClimatePair house={house} />
          {house.persons.length > 0 && <PeopleRow persons={house.persons} />}
          <LaundryRow />
          {tiles.length > 0 && <RoomTiles tiles={tiles} rooms={rooms} history={history} />}
        </>
      )}
    </aside>
  );
}
