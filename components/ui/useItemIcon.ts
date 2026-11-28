"use client";
import { iconChoice } from "@/lib/mdiAuto";
import { useIconSettings, useMdiIcon } from "@/lib/mdiStore";
import type { MdiIcon } from "@/lib/mdi";
import { useStore } from "@/lib/store";
import type { Item } from "@/lib/types";

/**
 * The Material Design drawing for a linked item's marker, or undefined when the marker should keep the dashboard's own icon: the owner's pick of one of Doshy's icons, "Doshy's own" in the
 * Display settings, an item that is not linked, an entity Home Assistant gives no icon for, or a drawing that is not available yet (offline and never saved).
 * `attributeOnly`: only an icon the entity itself names (a sensor or washer badge keeps its own reading-based icon otherwise).
 */
export function useItemIcon(item: Pick<Item, "entity" | "params">, attributeOnly = false): MdiIcon | undefined {
  const source = useIconSettings((s) => s.source);
  const st = useStore((s) => (item.entity ? s.states[item.entity] : undefined));
  return useMdiIcon(iconChoice(item.params, item.entity, st, source, attributeOnly).mdi);
}
