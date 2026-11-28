// Adapt the existing device and WashData views; no network, commands, or invented sensor values.
import type { Appliance, WeatherChange } from "./advisor.ts";
import type { AdvisorSettings } from "./advisorSettings.ts";
import type { HAState } from "./ha.ts";
import { sceneDevices } from "./sceneDevices.ts";
import type { Plan } from "./types.ts";
import { numberOf, washdataFamilies, washView } from "./washdata.ts";
import { stormWarning, type Tendency } from "./pressure.ts";

const DEFAULT_CYCLES: Record<Appliance["kind"], { name: string; minutes: number; kwh: number }> = {
  dishwasher: { name: "Dishwasher", minutes: 120, kwh: 1 },
  washer: { name: "Washing machine", minutes: 120, kwh: 0.8 },
  dryer: { name: "Dryer", minutes: 120, kwh: 2.5 },
};

export function advisorAppliances(plan: Plan, states: Record<string, HAState>, settings: AdvisorSettings, now: number): Appliance[] {
  const families = washdataFamilies(states);
  const controls = sceneDevices(plan, states);
  return (Object.keys(DEFAULT_CYCLES) as Appliance["kind"][]).filter((kind) => settings.appliances[kind]).map((kind) => {
    const family = families.find((f) => f.kind === kind);
    const view = family ? washView(states, family.base, now) : undefined;
    const cycle = view?.lastCycle;
    const measured = !!cycle?.minutes && !!cycle.kwh && cycle.minutes > 5 && cycle.minutes < 720 && cycle.kwh > 0 && cycle.kwh < 30;
    // Only an explicitly linked controllable appliance is offered to the automation builder, never a guessed HA entity.
    const linked = plan.items.find((it) => (kind === "washer" ? /wash(?!dish)/ : new RegExp(kind)).test(it.kind) && it.entity && controls.some((d) => d.entity === it.entity && d.kind === "switch"));
    return { kind, ...DEFAULT_CYCLES[kind], name: family?.name ?? DEFAULT_CYCLES[kind].name, minutes: measured ? cycle!.minutes! : DEFAULT_CYCLES[kind].minutes, kwh: measured ? cycle!.kwh! : DEFAULT_CYCLES[kind].kwh, measured, ...(linked?.entity ? { entity: linked.entity } : {}) };
  });
}

export function indoorTemperature(plan: Plan, states: Record<string, HAState>, settings: AdvisorSettings): number | null {
  const entities = settings.climate.indoor ? [settings.climate.indoor] : plan.rooms.map((r) => r.tempEntity).filter((e): e is string => !!e);
  const values = [...new Set(entities)].flatMap((entity) => {
    const st = states[entity];
    const raw = entity.startsWith("climate.") ? st?.attributes.current_temperature : numberOf(st);
    if (typeof raw !== "number" || !Number.isFinite(raw)) return [];
    const unit = st?.attributes.unit_of_measurement ?? st?.attributes.temperature_unit;
    const c = unit === "°F" || unit === "F" ? (raw - 32) * 5 / 9 : raw;
    return c >= -30 && c <= 60 ? [c] : [];
  });
  return values.length ? values.reduce((sum, c) => sum + c, 0) / values.length : null;
}

export function pressureAdvice(tendency: Tendency | undefined, now: number): WeatherChange | null {
  if (!tendency || tendency.direction !== "falling" || !stormWarning(tendency)) return null;
  return { title: "Pressure is falling fast: rain may be on the way; bring the cushions in", detail: `${Math.abs(tendency.deltaHpa3h).toFixed(1)} hPa lower over three hours`, why: [`Your barometer is ${tendency.label}: ${tendency.deltaHpa3h.toFixed(1)} hPa in three hours.`, "A rapid fall often accompanies an approaching weather front. This is a barometer tendency, not a guarantee of rain or a timed rain forecast."], start: now, end: now + 6 * 3_600_000 };
}
