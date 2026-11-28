"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { useVp } from "@/lib/useVp";
import { devicePlacements, useAreas } from "@/lib/haAreas";
import { useStore } from "@/lib/store";
import HudPanel from "./HudPanel";
import useRestoreFocus from "./useRestoreFocus";
import { buildGroups, flatten, mapAllDevices, placeMarker, rowHeight, visibleRows, type Row } from "./entityBrowserModel";
import { BrowserToolbar, EntityRow, GroupHead, MapSheet } from "./EntityBrowserRows";
import "./EntityBrowser.css";
import "./compactLink.css";

const ARM_MS = 4000;
const SCROLL_STEP_PX = 48; // the window of mounted rows reaches at least six rows (> 200 px) past the view, so a scroll position up to this stale shows no gap; a finger scroll fires an event per frame, each used to re-render the list (158 -> 53 renders for a 1300 px scroll)

/** Keeps `viewH` equal to the scroller's height (re-attached whenever the scroller is remounted, `key`). */
function useViewHeight(scroller: RefObject<HTMLDivElement | null>, key: unknown) {
  const [viewH, setViewH] = useState(480);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewH(el.clientHeight));
    ro.observe(el);
    setViewH(el.clientHeight);
    return () => ro.disconnect();
  }, [scroller, key]);
  return viewH;
}

export default function EntityBrowser({ onClose, initialQuery = "", initialMapRoom }: { onClose: () => void; initialQuery?: string; initialMapRoom?: string }) {
  const plan = useStore((s) => s.plan);
  const states = useStore((s) => s.states);
  const view = useStore((s) => s.view);
  const sel = useStore((s) => s.sel);
  const { areas, entityArea, loaded, error, load } = useAreas();

  const [q, setQ] = useState(initialQuery);
  const [chips, setChips] = useState<string[]>([]);
  const [diag, setDiag] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [armed, setArmed] = useState<string | null>(initialMapRoom ?? null);
  const [mapRoom, setMapRoom] = useState<string | null>(null);

  const scroller = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const tiny = useVp().vp !== "regular"; // compact layout: tiny and small screens
  const [openId, setOpenId] = useState<string | null>(null);

  useRestoreFocus();
  const viewH = useViewHeight(scroller, mapRoom);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(null), ARM_MS);
    return () => clearTimeout(t);
  }, [armed]);

  const groups = useMemo(() => buildGroups({ plan, states, entityArea, areas, q, chips, diag }), [plan, states, entityArea, areas, q, chips, diag]);
  const heightOf = useCallback((r: Row) => rowHeight(r, tiny, openId), [tiny, openId]);
  const searching = q.trim() !== "";
  const { rows, offsets, total } = useMemo(() => flatten(groups, collapsed, searching, heightOf), [groups, collapsed, searching, heightOf]);
  const { first, slice } = visibleRows(rows, offsets, heightOf, scrollTop, viewH);

  const shownTotal = groups.reduce((n, g) => n + g.shown.length, 0);
  const editing = view === "ha"; // linking and placing are Home Assistant mode actions
  const mapping = mapRoom ? plan.rooms.find((r) => r.id === mapRoom) : undefined;

  const pending = useMemo(() => (loaded ? devicePlacements(plan, states, entityArea, areas) : []), [loaded, plan, states, entityArea, areas]);
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    e.preventDefault();
    e.stopPropagation();
    if (mapRoom) setMapRoom(null);
    else onClose();
  };

  const bulk = editing && (
    <button
      className="eb-act eb-bulk-btn"
      disabled={!pending.length}
      onClick={() => mapAllDevices(pending)}
      title="Adds a marker for every light, speaker, climate and appliance device that is not linked to furniture yet, inside the room of its Home Assistant area"
    >
      {pending.length ? `Map ${pending.length} devices to rooms` : "All devices mapped"}
    </button>
  );
  const roomOf = (roomId: string | undefined) => (roomId ? plan.rooms.find((x) => x.id === roomId) : undefined);
  return (
    <HudPanel title="Entities" meta={`${shownTotal} / ${Object.keys(states).length}`} onClose={onClose} className="drawer eb">
      <div className="eb-body" onKeyDown={onKey}>
        <BrowserToolbar
          q={q}
          onQuery={(next) => { setQ(next); setScrollTop(0); scroller.current?.scrollTo({ top: 0 }); }}
          chips={chips}
          onChips={setChips}
          diag={diag}
          onDiag={setDiag}
          tiny={tiny}
          bulk={bulk}
          error={error}
          loaded={loaded}
          onRetry={() => void load()}
        />

        {mapping ? (
          <MapSheet room={mapping} areas={areas} entityArea={entityArea} onDone={() => setMapRoom(null)} />
        ) : (
          <div className="eb-scroll" ref={scroller} onScroll={(e) => { const top = e.currentTarget.scrollTop; setScrollTop((prev) => (Math.abs(top - prev) < SCROLL_STEP_PX && top > 0 ? prev : top)); }} role="list" aria-label="Entities by room">
            <div style={{ height: total, position: "relative" }}>
              {slice.map((r, i) => {
                const top = offsets[first + i];
                const room = roomOf(r.g.roomId);
                if (r.t === "head") {
                  return <GroupHead key={r.g.key} g={r.g} collapsed={r.collapsed} room={room} top={top} height={heightOf(r)} searching={searching} onToggle={() => setCollapsed((c) => ({ ...c, [r.g.key]: !r.collapsed }))} onMap={setMapRoom} />;
                }
                return (
                  <EntityRow
                    key={r.id}
                    id={r.id}
                    room={room}
                    top={top}
                    height={heightOf(r)}
                    tiny={tiny}
                    isOpen={tiny && openId === r.id}
                    isArmed={armed === r.id}
                    editing={editing}
                    plan={plan}
                    states={states}
                    sel={sel}
                    onToggleOpen={() => setOpenId(tiny && openId === r.id ? null : r.id)}
                    setArmed={setArmed}
                    onPlace={placeMarker}
                  />
                );
              })}
            </div>
            {!rows.length && <p className="empty">{Object.keys(states).length ? "No entities match." : "Waiting for Home Assistant."}</p>}
          </div>
        )}
      </div>
    </HudPanel>
  );
}
