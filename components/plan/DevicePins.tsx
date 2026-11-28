"use client";
import { iconOf } from "@/lib/deviceIcons";
import { useStore } from "@/lib/store";
import type { Item } from "@/lib/types";
import { iconComponent } from "../ui/deviceIcons";
import { domainIcon } from "../ui/domainIcon";
import MdiGlyph from "../ui/MdiGlyph";
import { useItemIcon } from "../ui/useItemIcon";

/** Device pins use nested SVG, not HTML, so plan exports and zooming preserve the drawing. */
function Pin({ item, px }: { item: Item; px: number }) {
  const mdi = useItemIcon(item);
  const Icon = iconComponent(iconOf(item.params)) ?? domainIcon(item.entity?.split(".")[0]);
  const select = () => useStore.getState().select({ type: "item", id: item.id });
  const s = 18 * px;
  return (
    <g transform={`translate(${item.x} ${item.y})`} data-device-pin={item.id} role="button" tabIndex={0} aria-label={`Select device ${item.entity}`} style={{ cursor: "pointer", color: "var(--text)" }} onPointerDown={(e) => { e.stopPropagation(); select(); }} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(); } }}>
      <title>{item.entity}</title>
      <circle r={14 * px} fill="var(--panel)" stroke="var(--accent)" strokeWidth={px} />
      <svg x={-s / 2} y={-s / 2} width={s} height={s} viewBox="0 0 256 256" pointerEvents="none" aria-hidden>
        {mdi ? <MdiGlyph icon={mdi} size={256} /> : <Icon size={256} />}
      </svg>
    </g>
  );
}

export default function DevicePins({ items, px }: { items: readonly Item[]; px: number }) {
  return items.filter((item) => item.entity).map((item) => <Pin key={item.id} item={item} px={px} />);
}
