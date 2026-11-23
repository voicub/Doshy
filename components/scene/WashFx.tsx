"use client";
import { WrenchIcon } from "@phosphor-icons/react";
import { badgeLine } from "@/lib/washdata";
import { WASH_ICON } from "../ui/washIcons";
import { iconComponent } from "../ui/deviceIcons";
import { DEVICE_EVENT } from "../ui/serviceActions";
import { iconOf } from "@/lib/deviceIcons";
import type { Item } from "@/lib/types";
import { Marker } from "./DeclutterLayer";
import type { WashLive } from "./useItemLive";
import "./WashFx.css";

const LIFT = 0.62; // metres above the item's top: clear of the item and of a sensor badge
const R = 13; // ring radius in the 30 px viewBox: clear of the icon's corners
const CIRC = 2 * Math.PI * R;

/**
 * What a WashData appliance is doing, over the item: a progress ring round its icon, the state in words and the time left ("Washing  45%  32 min"). Green when done,
 * amber paused, red on a problem; laundry still inside and problems are alerts (never hidden), idle and plain finished may shrink to a status dot.
 * A tap opens the appliance card. The owner's own item icon replaces the appliance icon.
 */
export default function WashFx({ item, elev, wash }: { item: Item; elev: number; wash: WashLive }) {
  const { view, badge } = wash;
  const color = `#${wash.tint.getHexString()}`;
  const Icon = iconComponent(iconOf(item.params)) ?? WASH_ICON[view.kind];
  const arc = badge.tone === "done" ? 100 : badge.pct;
  const open = (x: number, y: number) => window.dispatchEvent(new CustomEvent(DEVICE_EVENT, { detail: { entity: item.entity, x, y } }));
  return (
    <Marker id={`${item.id}:wash`} kind="run" position={[0, Math.min(item.h + elev, 2.4) + LIFT, 0]} alert={badge.attention} dot={badge.calm ? color : undefined} label={`${view.name}: ${badgeLine(view)}`}>
      <button
        type="button"
        className={`wfx ${badge.tone}${badge.attention ? " attention" : ""}`}
        style={{ ["--sc" as string]: color }}
        aria-label={`${view.name}: ${badgeLine(view)}${view.maintenanceDue ? ". Needs maintenance" : ""}. Open the appliance card`}
        onClick={(e) => {
          e.stopPropagation();
          open(e.clientX, e.clientY);
        }}
      >
        <span className="wfx-ring">
          <svg viewBox="0 0 30 30" aria-hidden>
            <circle className="wfx-track" cx="15" cy="15" r={R} />
            {arc !== undefined && <circle className="wfx-arc" cx="15" cy="15" r={R} strokeDasharray={`${(CIRC * arc) / 100} ${CIRC}`} transform="rotate(-90 15 15)" />}
          </svg>
          <Icon size={13} weight="regular" aria-hidden />
        </span>
        <span className="wfx-text">
          <b>{badge.title}</b>
          {badge.sub && <small>{badge.sub}</small>}
        </span>
        {view.maintenanceDue && (
          <span className="wfx-wrench" aria-hidden>
            <WrenchIcon size={9} weight="bold" />
          </span>
        )}
      </button>
    </Marker>
  );
}
