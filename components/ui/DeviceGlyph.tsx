"use client";
import type { ReactNode } from "react";
import { iconOf } from "@/lib/deviceIcons";
import { useStore } from "@/lib/store";
import type { Item } from "@/lib/types";
import { iconComponent } from "./deviceIcons";
import { domainIcon } from "./domainIcon";
import MdiGlyph from "./MdiGlyph";
import { useItemIcon } from "./useItemIcon";

/** The same manual/HA/default choice on markers, cards, room rows and scene devices. */
export default function DeviceGlyph({ item, itemId, entity, fallback, size = 16, className }: { item?: Pick<Item, "entity" | "params">; itemId?: string; entity?: string; fallback?: ReactNode; size?: number; className?: string }) {
  const linked = useStore((s) => itemId ? s.plan.items.find((i) => i.id === itemId) : entity ? s.plan.items.find((i) => i.entity === entity) : undefined);
  const device = item ?? (linked ? { ...linked, entity: entity ?? linked.entity } : { entity });
  const mdi = useItemIcon(device);
  const Own = iconComponent(iconOf(device.params));
  const Default = domainIcon(device.entity?.split(".")[0]);
  return <span className={className} aria-hidden style={{ display: "inline-flex", verticalAlign: "middle", flexShrink: 0 }}>{Own ? <Own size={size} /> : mdi ? <MdiGlyph icon={mdi} size={size} /> : fallback ?? <Default size={size} />}</span>;
}
