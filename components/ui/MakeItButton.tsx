"use client";
import { RobotIcon } from "@phosphor-icons/react";
import { recipesFor } from "@/lib/automationChoices";
import { useStore } from "@/lib/store";
import { useAutomationUi } from "./automationUi";

/** "Make it do something...": opens the automation sheet for this device. Only for devices a recipe can start from (a window or door sensor, a motion sensor, a light, a curtain). */
export default function MakeItButton({ entity, onOpen }: { entity: string; onOpen?: () => void }) {
  const states = useStore((s) => s.states);
  const domain = entity.slice(0, entity.indexOf("."));
  const dc = states[entity]?.attributes.device_class ?? "";
  const useful = domain === "light" || domain === "cover" || (domain === "binary_sensor" && ["door", "window", "opening", "garage_door", "motion", "occupancy", "presence"].includes(dc));
  if (!useful || recipesFor(entity, states).length < 2) return null;
  return (
    <button type="button" className="btn dc-btn" onClick={() => { onOpen?.(); useAutomationUi.getState().show(entity); }}>
      <RobotIcon size={14} /> Make it do something...
    </button>
  );
}
