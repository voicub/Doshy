import type { Def } from "@/lib/catalog";
import type { HAState } from "@/lib/ha";
import { ledLevel } from "@/lib/sensors";
import { securityLook, type Look as GlowLook } from "@/lib/securityLook";
import type { Item } from "@/lib/types";
import { ledOf, modeOf } from "@/lib/vacuumDrive";
import { isVacuumKind } from "@/lib/vacuumPath";
import type { ItemLive } from "./useItemLive";

const RUNNING = ["on", "playing", "heat", "cool", "heat_cool", "auto", "dry", "fan_only", "heating", "cooling", "drying", "cleaning", "running", "charging"];
const WASH_LEVEL = { run: 1, paused: 0.55, done: 0.4, problem: 0.9, muted: 0 } as const; // glow of a WashData appliance's own lights by what it is doing
const ECHO_IDLE = 0.25; // steady dim ring while an Echo is awake but silent

/** What an item's state and live data mean for its glow: the level it settles at and which kind of drive colours it. */
type Drive = {
  thermo: boolean;
  heater: boolean;
  heating: boolean;
  media: boolean;
  /** Glow level (0..1) from the sensor, thermostat or appliance state, before a light's own level or a security look overrides it. */
  level0: number;
  /** Camera recording dot, alarm panel light, robot vacuum rim light. */
  sec: GlowLook | undefined;
};

type DriveIn = { item: Item; def: Def; st: HAState | undefined; lv: ItemLive; presence: "home" | "away" | undefined; domain: string | undefined; echo: boolean };

export function deviceDrive({ item, def, st, lv, presence, domain, echo }: DriveIn): Drive {
  const washLevel = lv.wash ? WASH_LEVEL[lv.wash.badge.tone] : 0;
  const running = lv.wash ? lv.wash.view.running : lv.run ? lv.run.running : !!st && (RUNNING.includes(st.state) || presence === "home");
  const applianceLevel = echo ? (st?.state === "playing" ? 1 : st?.state === "idle" ? ECHO_IDLE : 0) : lv.wash ? washLevel : running ? 1 : 0;
  const thermo = item.kind === "thermostat_wall";
  const hvac = st?.attributes.hvac_action;
  const heater = domain === "climate" || /radiator|thermostat|convector|fireplace|woodstove/.test(item.kind);
  const heating = hvac === "heating" || (heater && hvac === undefined && (st?.state === "on" || st?.state === "heat" || st?.state === "heating"));
  const media = (domain === "media_player" && !echo && st?.state === "playing") || (!!lv.run?.flicker && lv.run.running);
  const level0 = lv.sensor ? ledLevel(lv.sensor) : thermo ? (st && !["off", "unavailable", "unknown"].includes(st.state) ? 1 : 0) : applianceLevel;
  const sec = def.cat === "Security" ? securityLook(item.kind, st) : isVacuumKind(item.kind) && st ? ledOf(modeOf(st.state)) : undefined;
  return { thermo, heater, heating, media, level0, sec };
}
