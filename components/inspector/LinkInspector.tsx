"use client";
import { LinkBreakIcon, XIcon } from "@phosphor-icons/react";
import { useMemo, type ReactNode } from "react";
import { CATALOG } from "@/lib/catalog";
import { WALL_T, roomAt } from "@/lib/geometry";
import { levelIdOf, planOfLevel } from "@/lib/levels";
import { TOGGLEABLE, domainOf } from "@/lib/ha";
import { autoAreaIds, entitiesOfRoom, roomAreaIds, useAreas, type HaArea } from "@/lib/haAreas";
import { useStore } from "@/lib/store";
import { domainsForCategory, offersWashdata } from "@/lib/entitySuggest";
import { familyOf } from "@/lib/running";
import { washdataOf } from "@/lib/washdata";
import { useVp } from "@/lib/useVp";
import type { Plan, Room } from "@/lib/types";
import EntityPicker from "../ui/EntityPicker";
import IconPicker from "./IconPicker";
import { domainIcon } from "../ui/domainIcon";
import { WASH_ICON } from "../ui/washIcons";
import "../ui/compactLink.css";
import HudPanel from "../ui/HudPanel";
import MonoLabel from "../ui/MonoLabel";
import { Group } from "./shared";
import { closeInspector } from "./closeInspector";
import PlugLink from "./PlugLink";
import WashLine from "./WashLine";
import RoomItems from "./RoomItems";
import { VacuumPosition } from "./SecurityOptions";
import { isWindowCurtain } from "@/lib/curtain";
import CurtainOptions from "./CurtainOptions";
import { securityDomains } from "@/lib/securityLook";
import { isVacuumKind } from "@/lib/vacuumPath";

const ITEM_DOMAINS = TOGGLEABLE;
const SENSOR_ITEM_DOMAINS = ["binary_sensor", "sensor", "lock", "siren"]; // what the Sensors catalog category links to (lib/sensors.ts)
const ENERGY_ITEM_DOMAINS = [...TOGGLEABLE, "sensor", "binary_sensor"]; // chargers and batteries report as a sensor ("charging", a percentage) as often as a switch
const ANIMAL_DOMAINS = [...TOGGLEABLE, "sensor", "binary_sensor", "device_tracker", "person"]; // a pet tracker (home / away), a feeder or door sensor, a coop lamp or automatic door
const PLUG_CATEGORIES = ["Appliances", "Kitchen & dining", "Climate", "Office", "Lighting & devices"]; // pieces that may be a basic appliance on a smart plug
const OPENING_DOMAINS = ["binary_sensor", "cover", "sensor", "switch"]; // a garage door is often a relay switch: "on" reads as open
const TEMP_DOMAINS = ["sensor", "climate"];
const HUMIDITY_DOMAINS = ["sensor"];
const PRESENCE_DOMAINS = ["binary_sensor"];
const POWER_DOMAINS = ["sensor"];

/** Area ids of every room within `reach` metres of a point (a wall's centre line sits just outside its rooms' floors). */
function areasNear(plan: Plan, p: { x: number; y: number }, areas: HaArea[], reach: number): string[] {
  const rooms = plan.rooms.filter((r) => p.x >= r.x - reach && p.x <= r.x + r.w + reach && p.y >= r.y - reach && p.y <= r.y + r.h + reach);
  return [...new Set(rooms.flatMap((r) => roomAreaIds(plan, r, areas)))];
}

/** Rarely used options: folded under "More" on compact screens, shown as they were everywhere else. */
function More({ tiny, children }: { tiny: boolean; children: ReactNode }) {
  return tiny ? (
    <details className="link-more">
      <summary>More</summary>
      {children}
    </details>
  ) : (
    <>{children}</>
  );
}

/** A list of linked entities: the chosen ones with a remove button, then a picker that adds one more. */
function EntityList({ label, values, onChange, domains, preferAreas }: { label: string; values: string[]; onChange: (v: string[] | undefined) => void; domains: readonly string[]; preferAreas: readonly string[] }) {
  const states = useStore((s) => s.states);
  const set = (next: string[]) => onChange(next.length ? next : undefined);
  return (
    <div className="field">
      <MonoLabel>{label}</MonoLabel>
      {values.map((id) => (
        <div key={id} className="entity-current">
          <span>
            <b>{states[id]?.attributes.friendly_name ?? id}</b>
            <small>{id}{states[id] ? ` / ${states[id].state}` : " / not found"}</small>
          </span>
          <button type="button" className="icon-btn" aria-label={`Remove ${id}`} onClick={() => set(values.filter((v) => v !== id))}><XIcon size={12} /></button>
        </div>
      ))}
      <EntityPicker label={`Add ${label.toLowerCase()}`} onChange={(v) => v && !values.includes(v) && set([...values, v])} domains={domains} preferAreas={preferAreas} />
    </div>
  );
}

function ItemLink({ id }: { id: string }) {
  const plan = useStore((s) => s.plan);
  const patch = useStore((s) => s.patch);
  const tiny = useVp().vp !== "regular";
  const areas = useAreas((s) => s.areas);
  const states = useStore((s) => s.states);
  const it = plan.items.find((i) => i.id === id);
  const room = it && roomAt(planOfLevel(plan, levelIdOf(plan, it)), it.x, it.y);
  const prefer = useMemo(() => (room ? roomAreaIds(plan, room, areas) : []), [plan, room, areas]);
  if (!it) return null;
  const def = CATALOG[it.kind];
  const wash = washdataOf(states, it.entity); // linked to a WashData appliance: its own line, icon and no plug invitation
  return (
    <HudPanel title="Link" meta={room?.name} onClose={closeInspector} className="inspector link-sheet">
      <h3 className="hud-name">{def?.label ?? it.kind}</h3>
      {!(def && isWindowCurtain(it.kind, def.cat)) && <EntityPicker label={def?.cat === "Sensors" ? "Sensor" : "Home Assistant entity"} value={it.entity} onChange={(entity) => patch("item", it.id, { entity })} domains={securityDomains(it.kind) ?? (def?.cat === "Sensors" ? SENSOR_ITEM_DOMAINS : def?.cat === "Energy" || def?.cat === "Garage & EV" ? ENERGY_ITEM_DOMAINS : def?.cat === "Animals" ? ANIMAL_DOMAINS : ITEM_DOMAINS)} fit={domainsForCategory(def?.cat)} preferAreas={prefer} wash={def && offersWashdata(it.kind, def.label, def.cat) ? { family: familyOf(`${it.kind} ${def.label}`) } : undefined} />}
      {wash && <WashLine item={it} />}
      {def?.cat === "Animals" && <small className="field-note">A pet tracker (device_tracker or person) shows the animal as a ghost marked away when it is not home. A feeder, door or motion sensor shows its reading. A switch or light turns the coop or kennel lamp on.</small>}
      {isVacuumKind(it.kind) && <VacuumPosition item={it} />}
      {def && isWindowCurtain(it.kind, def.cat) && <CurtainOptions item={it} prefer={prefer} />}
      {it.entity && <IconPicker item={it} fallback={wash ? WASH_ICON[wash.kind] : domainIcon(domainOf(it.entity))} />}
      <More tiny={tiny}>
        {def && PLUG_CATEGORIES.includes(def.cat) && !it.entity?.startsWith("light.") && !(wash && !it.params?.plugEntity && !it.params?.powerEntity) && <PlugLink item={it} roomName={room?.name} />}
        <RoomItems type="item" id={it.id} />
        <button className="btn" disabled={!it.entity && !it.params?.blackoutEntity} onClick={() => patch("item", it.id, { entity: undefined, ...(it.params?.blackoutEntity ? { params: Object.fromEntries(Object.entries(it.params).filter(([k]) => k !== "blackoutEntity")) } : {}) })}><LinkBreakIcon size={14} /> Clear link{def && isWindowCurtain(it.kind, def.cat) ? "s" : ""}</button>
      </More>
    </HudPanel>
  );
}

function RoomLink({ id }: { id: string }) {
  const plan = useStore((s) => s.plan);
  const states = useStore((s) => s.states);
  const patch = useStore((s) => s.patch);
  const tiny = useVp().vp !== "regular";
  const { areas, entityArea, load, error } = useAreas();
  const r = plan.rooms.find((x) => x.id === id);
  const brought = useMemo(() => (r ? entitiesOfRoom(plan, r, entityArea, states, areas) : []), [plan, r, entityArea, states, areas]);
  if (!r) return null;

  const set = (p: Partial<Room>) => patch("room", r.id, p);
  const chosen = r.areas ?? autoAreaIds(r, areas);
  const toggleArea = (aid: string) => set({ areas: chosen.includes(aid) ? chosen.filter((a) => a !== aid) : [...chosen, aid] });
  const linked = !!(r.areas || r.tempEntity || r.humidityEntity || r.presenceEntities?.length || r.powerEntities?.length);

  return (
    <HudPanel title="Link" meta={r.name} onClose={closeInspector} className="inspector link-sheet">
      <Group label="Home Assistant areas">
        {!areas.length && <small className={`field-note ${error ? "warn" : ""}`}>{error ? `Areas unavailable: ${error}` : "Loading areas"}</small>}
        <div className="chips">
          {areas.map((a) => (
            <button key={a.id} type="button" className="preset" aria-pressed={chosen.includes(a.id)} onClick={() => toggleArea(a.id)}>{a.name}</button>
          ))}
        </div>
        {error && <button type="button" className="btn" onClick={() => void load()}>Retry areas</button>}
        {r.areas ? (
          <button type="button" className="btn" onClick={() => set({ areas: undefined })}>Match by room name</button>
        ) : (
          <small className="field-note">Matched by room name. Pick areas to set them explicitly.</small>
        )}
        {!!areas.length && (
          <details className="brought">
            <summary>{brought.length} entities in this room</summary>
            <ul>
              {brought.slice(0, 60).map((e) => (
                <li key={e}><span>{states[e]?.attributes.friendly_name ?? e}</span><small>{e}</small></li>
              ))}
            </ul>
          </details>
        )}
      </Group>
      <EntityPicker label="Temperature sensor" value={r.tempEntity} onChange={(tempEntity) => set({ tempEntity })} domains={TEMP_DOMAINS} preferAreas={chosen} />
      <EntityPicker label="Humidity sensor" value={r.humidityEntity} onChange={(humidityEntity) => set({ humidityEntity })} domains={HUMIDITY_DOMAINS} preferAreas={chosen} />
      <More tiny={tiny}>
        <EntityList label="Presence sensors" values={r.presenceEntities ?? []} onChange={(presenceEntities) => set({ presenceEntities })} domains={PRESENCE_DOMAINS} preferAreas={chosen} />
        <EntityList label="Power sensors" values={r.powerEntities ?? []} onChange={(powerEntities) => set({ powerEntities })} domains={POWER_DOMAINS} preferAreas={chosen} />
        <RoomItems type="room" id={r.id} />
        <button className="btn" disabled={!linked} onClick={() => set({ areas: undefined, tempEntity: undefined, humidityEntity: undefined, presenceEntities: undefined, powerEntities: undefined })}>
          <LinkBreakIcon size={14} /> Clear link
        </button>
      </More>
    </HudPanel>
  );
}

function OpeningLink({ id }: { id: string }) {
  const plan = useStore((s) => s.plan);
  const patch = useStore((s) => s.patch);
  const tiny = useVp().vp !== "regular";
  const areas = useAreas((s) => s.areas);
  const o = plan.openings.find((x) => x.id === id);
  const wall = o && plan.walls.find((w) => w.id === o.wallId);
  const prefer = useMemo(() => (wall ? areasNear(planOfLevel(plan, levelIdOf(plan, wall)), { x: (wall.a.x + wall.b.x) / 2, y: (wall.a.y + wall.b.y) / 2 }, areas, WALL_T + 0.1) : []), [plan, wall, areas]);
  if (!o) return null;
  return (
    <HudPanel title="Link" meta={o.type === "door" ? "Door" : "Window"} onClose={closeInspector} className="inspector link-sheet">
      <EntityPicker label="Contact sensor, cover or switch" value={o.entity} onChange={(entity) => patch("opening", o.id, { entity })} domains={OPENING_DOMAINS} preferAreas={prefer} />
      {!tiny && <button className="btn" disabled={!o.entity} onClick={() => patch("opening", o.id, { entity: undefined })}><LinkBreakIcon size={14} /> Clear link</button>}
    </HudPanel>
  );
}

/** What a selection is linked to in Home Assistant: an entity for furniture and openings, areas and sensors for rooms. */
export default function LinkInspector({ type, id }: { type: "item" | "room" | "opening"; id: string }) {
  if (type === "item") return <ItemLink id={id} />;
  if (type === "room") return <RoomLink id={id} />;
  return <OpeningLink id={id} />;
}
