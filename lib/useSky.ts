import { useEffect, useMemo, useState } from "react";
import { computeSky, useSkySettings, type SkyState } from "./sky";
import { useStore } from "./store";

/** Live sky: re-evaluated every 30 s (the sun and HA's `sun.sun` move slowly) and whenever states or settings change. */
export function useSky(): SkyState {
  const states = useStore((s) => s.states);
  const manual = useStore((s) => s.time);
  const { timeMode, weatherMode, seasonMode, holidayMode, easterRite, windMode, windSpeed, windFrom } = useSkySettings();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);
  return useMemo(
    () => computeSky(states, now, { timeMode, weatherMode, seasonMode, holidayMode, easterRite, windMode, windSpeed, windFrom }, manual),
    [states, now, timeMode, weatherMode, seasonMode, holidayMode, easterRite, windMode, windSpeed, windFrom, manual],
  );
}
