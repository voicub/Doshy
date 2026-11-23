"use client";
import { LockSimpleIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef } from "react";
import { create } from "zustand";
import { CATALOG } from "@/lib/catalog";
import { roomAt } from "@/lib/geometry";
import { levelIdOf, planOfLevel } from "@/lib/levels";
import { roomItems } from "@/lib/rooms";
import { useStore } from "@/lib/store";
import { useItemFocus } from "../scene/itemFocus";
import { describePick } from "../scene/edit/pickInfo";
import MonoLabel from "../ui/MonoLabel";
import "./RoomItems.css";
import "./lock.css";

/** Open state and search text outlive the inspector, which remounts whenever another item is selected. */
const useListUi = create<{ open: boolean; q: string }>(() => ({ open: false, q: "" }));

/**
 * "Items in this room": every pickable piece of the selected room (or of the selected item's room), searchable by name.
 * A row selects the piece and shows where it is in the scene; hovering or focusing it marks it there. The way in for tiny or hidden things and for touch.
 */
export default function RoomItems({ type, id }: { type: "item" | "room"; id: string }) {
  const plan = useStore((s) => s.plan);
  const states = useStore((s) => s.states);
  const view = useStore((s) => s.view);
  const active = useStore((s) => s.activeLevel);
  const sel = useStore((s) => s.sel);
  const { open, q } = useListUi();
  const marked = useRef(false);
  const mark = (id: string | null) => {
    marked.current = id !== null;
    useItemFocus.getState().setHover(id);
  };
  useEffect(() => () => void (marked.current && useItemFocus.getState().setHover(null)), []);

  const rows = useMemo(() => {
    const it = type === "item" ? plan.items.find((i) => i.id === id) : undefined;
    const room = type === "room" ? plan.rooms.find((r) => r.id === id) : it && roomAt(planOfLevel(plan, levelIdOf(plan, it)), it.x, it.y);
    if (!room) return [];
    const level = levelIdOf(plan, { level: active });
    const needle = q.trim().toLowerCase();
    return roomItems(plan, room)
      .filter((i) => !CATALOG[i.kind]?.pillar && (view !== "furniture" || levelIdOf(plan, i) === level)) // the same pieces the 3D view lets you pick
      .map((i) => ({ i, ...describePick(plan, states, { type: "item", id: i.id }) }))
      .filter(({ i, name }) => !needle || `${name} ${CATALOG[i.kind]?.label ?? ""} ${i.entity ?? ""}`.toLowerCase().includes(needle))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [plan, states, view, active, type, id, q]);

  const pick = (itemId: string) => {
    useStore.getState().select({ type: "item", id: itemId });
    useItemFocus.getState().frameItem(itemId);
  };

  return (
    <details className="room-items" open={open} onToggle={(e) => useListUi.setState({ open: e.currentTarget.open })}>
      <summary>
        <MonoLabel>Items in this room</MonoLabel>
        <span className="ri-count">{rows.length}</span>
      </summary>
      <input type="search" className="ri-search" placeholder="Find by name" aria-label="Find an item in this room" value={q} onChange={(e) => useListUi.setState({ q: e.target.value })} />
      <ul className="ri-list">
        {rows.map(({ i, name, sub }) => {
          const here = sel?.type === "item" && sel.id === i.id;
          return (
            <li key={i.id}>
              <button
                type="button"
                className="ri-row"
                aria-current={here ? "true" : undefined}
                onClick={() => pick(i.id)}
                onPointerEnter={() => mark(i.id)}
                onPointerLeave={() => mark(null)}
                onFocus={() => mark(i.id)}
                onBlur={() => mark(null)}
              >
                <b>
                  {name}
                  {i.locked && <LockSimpleIcon className="lock-glyph" size={11} weight="bold" role="img" aria-label="Locked" />}
                </b>
                {sub && <small>{sub}</small>}
              </button>
            </li>
          );
        })}
        {!rows.length && <li className="ri-empty">{q ? "Nothing matches." : "Nothing here yet."}</li>}
      </ul>
    </details>
  );
}
