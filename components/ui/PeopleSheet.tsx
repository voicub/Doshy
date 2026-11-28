"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { colorOf, defaultSettings, describe, letterOf, prefsOf, PALETTE, WHERE, type PersonPrefs, type PresenceSettings, type Resolution, type Where } from "@/lib/presence";
import { usePresenceView } from "@/lib/presenceHooks";
import { usePresence } from "@/lib/presenceStore";
import { useStore } from "@/lib/store";
import EntityPicker from "./EntityPicker";
import HudPanel from "./HudPanel";
import MonoLabel from "./MonoLabel";
import { usePeopleUi } from "./peopleUi";
import Segmented from "./Segmented";
import useRestoreFocus from "./useRestoreFocus";
import "./people.css";

const ON_OFF = ["on", "off"] as const;
const onOff = (o: (typeof ON_OFF)[number]) => (o === "on" ? "On" : "Off");
const WHERE_LABEL: Record<Where, string> = { auto: "Auto", fixed: "Fixed room", hidden: "Hidden" };
const WHERE_HELP: Record<Where, string> = {
  auto: "Follows a room sensor if there is one (for example sensor.anna_room). Without one, they wait in the living room.",
  fixed: "Always shown in the room you pick, whenever they are home.",
  hidden: "Counted as home on the House now bar, but never drawn in the 3D view.",
};
const COLOR_NAME: Record<(typeof PALETTE)[number], string> = { "#5ad7ff": "Cyan", "#ff9a62": "Orange", "#7be08a": "Green", "#ffd25a": "Yellow", "#c792ff": "Violet", "#ff7ab8": "Pink", "#6f9bff": "Blue", "#e9eef2": "White" };
const SENSOR_DOMAINS = ["sensor", "binary_sensor"] as const;
const TRACKER_DOMAINS = ["device_tracker"] as const;

const patch = (entity: string, change: Partial<PersonPrefs>) => usePresence.getState().patch(entity, change);
const letterOnly = (v: string) => Array.from(v.trim()).slice(0, 2).join("") || undefined;

/** The names of the rooms people can be shown in (alcoves are part of their room), each once. */
function useRoomNames(): string[] {
  const rooms = useStore((s) => s.plan.rooms);
  return useMemo(() => [...new Set(rooms.filter((r) => !r.parent).map((r) => r.name))], [rooms]);
}

function WhereControls({ r, prefs, roomNames }: { r: Resolution; prefs: PersonPrefs; roomNames: string[] }) {
  const [advanced] = useState(() => !!prefs.sensor); // folded unless a sensor was already picked
  const choose = (where: Where) => patch(r.entity, { where, ...(where === "fixed" && !prefs.room ? { room: r.roomName ?? roomNames[0] } : {}) });
  const missing = prefs.room !== undefined && !roomNames.includes(prefs.room);
  return (
    <>
      <div className="ppl-row">
        <MonoLabel>Where are they?</MonoLabel>
        <Segmented<Where> label={`Where ${r.name} is shown`} value={prefs.where} options={WHERE} format={(o) => WHERE_LABEL[o]} onChange={choose} />
      </div>
      <p className="hint">{WHERE_HELP[prefs.where]}</p>
      {prefs.where === "fixed" && (
        <label className="ppl-row">
          <MonoLabel>Room</MonoLabel>
          <select className="ppl-select" value={prefs.room ?? ""} onChange={(e) => patch(r.entity, { room: e.target.value })}>
            {missing && <option value={prefs.room}>{prefs.room} (not in this plan)</option>}
            {roomNames.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
      )}
      {prefs.where === "auto" && (
        <details className="ppl-adv" open={advanced}>
          <summary>Advanced: use a specific sensor</summary>
          <EntityPicker label="Use this sensor" value={prefs.sensor} onChange={(sensor) => patch(r.entity, { sensor })} domains={SENSOR_DOMAINS} />
          <p className="hint">A sensor whose state is a room name (a room-presence sensor such as Bermuda or ESPresense), or a motion sensor linked to a room. Leave it empty to let Doshy look for one.</p>
        </details>
      )}
    </>
  );
}

function PersonCard({ r, tracker, roomNames }: { r: Resolution; tracker: boolean; roomNames: string[] }) {
  const prefs = usePresence((s) => prefsOf(s, r.entity));
  const color = colorOf(r.entity, prefs);
  return (
    <section className="ppl-card" aria-label={r.name}>
      <header className="ppl-top">
        <span className="ppl-badge" style={{ ["--pc" as string]: color }} aria-hidden>{letterOf(r.name, prefs)}</span>
        <div className="ppl-who">
          <strong>{r.name}</strong>
          <span className="ppl-id">{r.entity}</span>
        </div>
        <Segmented label={`Show ${r.name} in the home`} value={prefs.enabled ? "on" : "off"} options={ON_OFF} format={onOff} onChange={(o) => patch(r.entity, { enabled: o === "on" })} />
      </header>
      <p className="hint">{describe(r)}</p>
      {prefs.enabled && (
        <>
          <div className="ppl-row">
            <MonoLabel>Colour</MonoLabel>
            <div className="ppl-swatches" role="group" aria-label={`Colour for ${r.name}`}>
              {PALETTE.map((c) => (
                <button key={c} type="button" className="ppl-sw" style={{ background: c }} aria-pressed={c === color} aria-label={COLOR_NAME[c]} title={COLOR_NAME[c]} onClick={() => patch(r.entity, { color: c })} />
              ))}
            </div>
          </div>
          <label className="ppl-row">
            <MonoLabel>Letter</MonoLabel>
            <input className="ppl-letter" maxLength={2} value={prefs.letter ?? ""} placeholder={letterOf(r.name, { ...prefs, letter: undefined })} aria-label={`Letter shown for ${r.name}`} onChange={(e) => patch(r.entity, { letter: letterOnly(e.target.value) })} />
          </label>
          <WhereControls r={r} prefs={prefs} roomNames={roomNames} />
        </>
      )}
      {tracker && (
        <button type="button" className="btn" onClick={() => usePresence.getState().removeTracker(r.entity)}>Remove this tracker</button>
      )}
    </section>
  );
}

/**
 * Who shows up in the home: for every person Home Assistant knows (and any tracker you add), a switch, a colour, a letter and where they are shown.
 * Every change applies at once and is saved on this device; "Back to defaults" can be undone.
 */
export default function PeopleSheet() {
  const close = () => usePeopleUi.getState().setOpen(false);
  const root = useRef<HTMLDivElement>(null);
  const view = usePresenceView();
  const show = usePresence((s) => s.show);
  const trackers = usePresence((s) => s.trackers);
  const roomNames = useRoomNames();
  const [undo, setUndo] = useState<PresenceSettings | null>(null);

  useRestoreFocus();
  useEffect(() => {
    root.current?.querySelector<HTMLElement>("button")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && usePeopleUi.getState().setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const reset = () => {
    const { show, people, trackers } = usePresence.getState();
    setUndo({ show, people, trackers });
    usePresence.getState().replace(defaultSettings());
  };
  const restore = () => {
    if (undo) usePresence.getState().replace(undo);
    setUndo(null);
  };

  return (
    <div className="ppl-scrim" ref={root} role="dialog" aria-modal="true" aria-label="People in the home" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <HudPanel title="People" meta="who shows up in the home" onClose={close} className="ppl">
        <div className="ppl-body">
          <div className="ppl-master">
            <MonoLabel>People in the home</MonoLabel>
            <Segmented label="People in the home" value={show ? "on" : "off"} options={ON_OFF} format={onOff} onChange={(o) => usePresence.getState().setShow(o === "on")} />
          </div>
          <p className="hint">Each person who is home appears as a small figure in the room they are in (a flat disc with their letter on a small screen), and walks to the next room when they move. People who are away are not drawn.</p>
          {view.length === 0 && <p className="hint ppl-empty">Home Assistant has not reported any people yet. Add a phone or other tracker below, or create people in Home Assistant under Settings, People.</p>}
          {view.map((r) => (
            <PersonCard key={r.entity} r={r} tracker={trackers.includes(r.entity)} roomNames={roomNames} />
          ))}
          <div className="ppl-card">
            <EntityPicker label="Add a tracker" onChange={(entity) => entity && usePresence.getState().addTracker(entity)} domains={TRACKER_DOMAINS} />
            <p className="hint">For a phone or other tracker that is not part of a person in Home Assistant.</p>
          </div>
        </div>
        <footer className="ppl-foot">
          <button type="button" className="btn" onClick={reset}>Back to defaults</button>
          {undo && <button type="button" className="btn primary" onClick={restore}>Undo</button>}
          <p className="hint">Everybody on, colours and letters chosen for you, rooms from the sensors.</p>
        </footer>
      </HudPanel>
    </div>
  );
}
