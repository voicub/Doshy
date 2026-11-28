"use client";
import { GaugeIcon } from "@phosphor-icons/react";
import { displayUnit, formatPressure, fromHpa, tendencyArrow } from "@/lib/pressure";
import { pressureChip, pressureSentence, pressureTip } from "@/lib/pressureText";
import { useDisplay } from "@/lib/displayStore";
import { usePressure } from "@/lib/usePressure";
import MonoLabel from "./MonoLabel";
import "./pressure.css";

/** What every pressure spot needs: the reading and the pieces of text, or null when the home has no barometer (then nothing about pressure is drawn at all). */
function usePressureText() {
  const { reading, tendency, forecast } = usePressure();
  const pref = useDisplay((s) => s.pressureUnit);
  if (!reading) return null;
  const tip = pressureTip(reading, tendency, forecast, pref);
  return { reading, tendency, pref, tip, sentence: pressureSentence(reading, tendency, pref) };
}

/** The telemetry bar's pressure cell: "1013 hPa ↗". The tooltip has the three hour change, the Zambretti indication and where the number comes from. */
export function PressureChip() {
  const p = usePressureText();
  if (!p) return null;
  return (
    <div className="t-cell t-pressure" title={p.tip} role="img" aria-label={`Air pressure ${p.sentence}`}>
      <GaugeIcon size={15} aria-hidden />
      <span className="t-val">{pressureChip(p.reading, p.tendency, p.pref)}</span>
    </div>
  );
}

/** The compact strip's item (inside the house button, which opens the house card): the number and the arrow, the unit when there is room. */
export function PressureStripItem() {
  const p = usePressureText();
  if (!p) return null;
  const unit = displayUnit(p.pref, p.reading.unit);
  const value = fromHpa(p.reading.hpa, unit);
  return (
    <span className="cs-item cs-pressure" title={p.tip}>
      <GaugeIcon size={20} aria-hidden />
      <b>{unit === "hPa" || unit === "mmHg" ? Math.round(value) : value.toFixed(unit === "kPa" ? 1 : 2)}{p.tendency && <i className="cs-trend">{tendencyArrow(p.tendency)}</i>}</b>
      <small>{unit}</small>
    </span>
  );
}

/** A row of the house / Live card: "Pressure 1013 hPa, rising slowly". */
export function PressureRow() {
  const p = usePressureText();
  if (!p) return null;
  return (
    <div className="lb-pressure" title={p.tip}>
      <MonoLabel>Pressure</MonoLabel>
      <span className="lb-v">
        <span>{formatPressure(p.reading.hpa, p.pref, p.reading.unit)}</span>
        {p.tendency ? <span>{`${tendencyArrow(p.tendency)} ${p.tendency.label}`}</span> : <span>trend in a few hours</span>}
      </span>
    </div>
  );
}
