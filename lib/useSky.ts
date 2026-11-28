import { useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import type { HAState } from "./ha";
import { readInputs, type SkyInputs } from "./liveSky";
import { skyFromInputs, useSkySettings, type SkyState } from "./sky";
import { useStore } from "./store";
import { dateOfDay } from "./seasonYear";
import { useSeasonPreview } from "./seasonPreview";
import { usePressure } from "./usePressure";

// Many components call useSky for the same states object: read it once, not once per component.
let last: { states: Record<string, HAState>; choice: string; inputs: SkyInputs } | null = null;
function inputsOf(states: Record<string, HAState>, choice: string): SkyInputs {
  if (last?.states === states && last.choice === choice) return last.inputs;
  last = { states, choice, inputs: readInputs(states, choice) };
  return last.inputs;
}

/**
 * Live sky: re-evaluated every 30 s (the sun and HA's `sun.sun` move slowly) and when something the sky reads changes: the sun, the home position,
 * the weather entity, the wind sensors, the moon or a setting. A poll that changes nothing else keeps the same inputs, so it re-renders nothing.
 */
export function useSky(): SkyState {
  const choice = useSkySettings((s) => s.weatherEntity);
  const inputs = useStore(useShallow((s) => inputsOf(s.states, choice)));
  const manual = useStore((s) => s.time);
  const pressureDelta3h = usePressure((s) => s.tendency?.deltaHpa3h);
  const settings = useSkySettings(
    useShallow((s) => ({ timeMode: s.timeMode, weatherMode: s.weatherMode, seasonMode: s.seasonMode, holidayMode: s.holidayMode, easterRite: s.easterRite, windMode: s.windMode, windSpeed: s.windSpeed, windFrom: s.windFrom })),
  );
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);
  const previewDay = useSeasonPreview((s) => s.day);
  const preview = previewDay !== null;
  // a previewed day keeps today's clock: the sun, the holiday window and the season all follow that date, the weather stays today's
  const at = useMemo(() => (previewDay === null ? now : dateOfDay(now.getFullYear(), previewDay, now)), [now, previewDay]);
  return useMemo(() => skyFromInputs({ ...inputs, pressureDelta3h }, at, { ...settings, preview }, manual), [inputs, pressureDelta3h, at, settings, preview, manual]);
}
