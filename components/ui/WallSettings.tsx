"use client";
import { SECONDS_CHOICES, SLIDE_KINDS, SLIDE_LABEL, START_CHOICES, WALL_TRY_EVENT, type SlideKind } from "@/lib/wall";
import { useWall } from "@/lib/wallStore";
import Segmented from "./Segmented";
import "./wallSettings.css";

const ON_OFF = ["off", "on"] as const;

/** The Wall display rows of the Display settings: slides that rotate after a while with no touch. Everything is saved on this device. */
export default function WallSettings({ onClose }: { onClose: () => void }) {
  const s = useWall();
  const tryNow = () => {
    onClose();
    window.dispatchEvent(new Event(WALL_TRY_EVENT));
  };
  return (
    <section className="disp-sec">
      <h3 className="label disp-h">Wall display</h3>
      <Segmented label="Wall display" value={s.on ? "on" : "off"} options={ON_OFF} format={(o) => (o === "on" ? "On" : "Off")} onChange={(o) => s.setOn(o === "on")} />
      <p className="hint">
        {s.on
          ? "After a while with no touch the screen shows a calm slideshow of your home. A touch brings the normal screen back. It replaces the dark screensaver."
          : "Turn it on for a screen on the wall: a slideshow of your home with the time, the weather and what is going on."}
      </p>
      {s.on && (
        <>
          <Segmented label="Start after" value={String(s.startMin)} options={START_CHOICES.map(String)} format={(o) => (o === "0" ? "Always" : `${o} min`)} onChange={(o) => s.setStartMin(Number(o))} />
          <p className="hint">{s.startMin === 0 ? "It starts at once, and comes back a minute after each touch." : "Minutes with no touch before the slideshow starts."}</p>
          <fieldset className="wall-kinds">
            <legend className="hint">Show</legend>
            {SLIDE_KINDS.map((k: SlideKind) => (
              <label key={k} className="wall-kind">
                <input type="checkbox" checked={s.kinds.includes(k)} onChange={() => s.toggleKind(k)} />
                <span>{SLIDE_LABEL[k]}</span>
              </label>
            ))}
          </fieldset>
          <Segmented label="Seconds per slide" value={String(s.secs)} options={[...new Set([...SECONDS_CHOICES, s.secs])].sort((a, b) => a - b).map(String)} format={(o) => `${o} s`} onChange={(o) => s.setSecs(Number(o))} />
          <p className="hint">How long each slide stays. A room is shown for 8 to 12 seconds, whatever you choose here.</p>
          <details className="wall-more">
            <summary>Night and screen care</summary>
            <Segmented label="Dim at night" value={s.dim ? "on" : "off"} options={ON_OFF} format={(o) => (o === "on" ? "Dim at night: on" : "Dim at night: off")} onChange={(o) => s.setDim(o === "on")} />
            <p className="hint">Darkens the slideshow while the sun is down. A browser cannot switch the screen itself off: see the Raspberry Pi guide (docs/wall-display.md) for that.</p>
            <Segmented label="Protect the screen" value={s.shift ? "on" : "off"} options={ON_OFF} format={(o) => (o === "on" ? "Protect: on" : "Protect: off")} onChange={(o) => s.setShift(o === "on")} />
            <p className="hint">Moves the picture by a few pixels every minute so a fixed clock never burns into the panel.</p>
          </details>
          <button type="button" className="btn" onClick={tryNow}>Try it now</button>
        </>
      )}
    </section>
  );
}
