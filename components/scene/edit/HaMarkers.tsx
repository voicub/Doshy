"use client";
import { AppWindowIcon, DoorIcon, DropIcon, FanIcon, GaugeIcon, HouseLineIcon, LightbulbFilamentIcon, LinkBreakIcon, PlugIcon, TelevisionIcon, ThermometerIcon, type Icon } from "@phosphor-icons/react";
import { CATALOG } from "@/lib/catalog";
import { useStore } from "@/lib/store";
import { elevationOf, levelIdOf } from "@/lib/levels";
import type { Item, Room, Sel } from "@/lib/types";
import DeviceGlyph from "../../ui/DeviceGlyph";
import { Marker } from "../DeclutterLayer";
import { boxOf } from "./Outlines";
import "./pick.css";

const DOMAIN_ICON: Record<string, Icon> = {
  light: LightbulbFilamentIcon,
  switch: PlugIcon,
  input_boolean: PlugIcon,
  media_player: TelevisionIcon,
  fan: FanIcon,
  humidifier: DropIcon,
  climate: ThermometerIcon,
  water_heater: ThermometerIcon,
  sensor: GaugeIcon,
};
const APPLIANCE = /fridge|washer|dryer|dishwasher|oven|hob|\btv\b|television|radiator|\bfan\b|purifier|humidifier|vacuum|echo|speaker|boiler|heater|thermostat|plug|socket|switch/i;
const iconOf = (entity: string): Icon => DOMAIN_ICON[entity.split(".")[0]] ?? GaugeIcon;

const roomLinked = (r: Room) => !!(r.tempEntity || r.humidityEntity || r.presenceEntities?.length || r.powerEntities?.length || r.areas?.length);

/** The mark's icon for a linked item: its own Material Design icon (the owner's pick or Home Assistant's) when it has one, else the default of its kind. */
function ItemGlyph({ item, Glyph, linked }: { item: Item; Glyph: Icon; linked: boolean }) {
  return <DeviceGlyph item={item} size={14} fallback={<Glyph size={14} weight={linked ? "fill" : "regular"} aria-hidden />} />;
}

/** One link mark; a tap selects what it stands for (the same as clicking it in the scene), which also lets a fanned-out cluster of marks be picked from. */
function Mark({ id, item, position, linked, selected, Glyph, label, target }: { id: string; item?: Item; position: [number, number, number]; linked: boolean; selected: boolean; Glyph: Icon; label?: string; target: Sel }) {
  return (
    <Marker id={`${id}:ha`} kind="link" position={position} label={label ?? (linked ? "Linked to Home Assistant" : "Not linked")}>
      <button type="button" className={`ha-mark${linked ? " linked" : ""}${selected ? " sel" : ""}`} title={linked ? "Linked to Home Assistant" : "Not linked"} onClick={() => useStore.getState().select(target)}>
        {item ? <ItemGlyph item={item} Glyph={Glyph} linked={linked} /> : <Glyph size={14} weight={linked ? "fill" : "regular"} aria-hidden />}
        {label && <span>{label}</span>}
      </button>
    </Marker>
  );
}

/** Link status over everything that can be linked to Home Assistant: a cyan ring with the entity's icon when linked, a dim dashed ring when not. A tap on a mark selects its thing; the declutter layer keeps marks apart and folds piles into one numbered marker. */
export default function HaMarkers() {
  const plan = useStore((s) => s.plan);
  const sel = useStore((s) => s.sel);
  const on = (type: string, id: string) => sel?.type === type && sel.id === id;
  return (
    <>
      {plan.rooms
        .filter((r) => !r.parent)
        .map((r) => (
          <Mark key={r.id} id={r.id} target={{ type: "room", id: r.id }} position={[r.x + r.w / 2, elevationOf(plan, levelIdOf(plan, r)) + 0.16, r.y + r.h / 2]} linked={roomLinked(r)} selected={on("room", r.id)} Glyph={roomLinked(r) ? HouseLineIcon : LinkBreakIcon} label={r.name} />
        ))}
      {plan.items.map((it) => {
        const def = CATALOG[it.kind];
        if (!def || !(it.entity || def.light || def.cat === "Lighting & devices" || APPLIANCE.test(`${it.kind} ${def.label}`))) return null;
        const b = boxOf(plan, { type: "item", id: it.id });
        if (!b) return null;
        return <Mark key={it.id} id={it.id} item={it.entity ? it : undefined} target={{ type: "item", id: it.id }} position={[it.x, Math.min(b.y1, b.lv + 2.4) + 0.18, it.y]} linked={!!it.entity} selected={on("item", it.id)} Glyph={it.entity ? iconOf(it.entity) : LinkBreakIcon} />;
      })}
      {plan.openings.map((o) => {
        const b = boxOf(plan, { type: "opening", id: o.id });
        if (!b) return null;
        return <Mark key={o.id} id={o.id} target={{ type: "opening", id: o.id }} position={[b.x, b.y1 + 0.18, b.z]} linked={!!o.entity} selected={on("opening", o.id)} Glyph={o.entity ? (o.type === "door" ? DoorIcon : AppWindowIcon) : LinkBreakIcon} />; // box y is already world (level floor included)
      })}
    </>
  );
}
