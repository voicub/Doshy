"use client";
import { MapTrifoldIcon, QuestionIcon, SignOutIcon, SlidersHorizontalIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { sortedLevels } from "@/lib/levels";
import { useStore } from "@/lib/store";
import { EYE_MAX, EYE_MIN } from "@/lib/walkMove";
import { useWalk } from "@/lib/walkStore";
import { walkInput } from "../scene/walk/walkInput";
import WalkHelp from "./WalkHelp";
import WalkJoystick from "./WalkJoystick";
import WalkMiniMap from "./WalkMiniMap";
import "./WalkHud.css";

const NOTE_MS = 6000;

/** The storeys as buttons, lowest first: choosing one puts the walker on that floor, as near as it can to where they stand. */
function FloorButtons() {
  const raw = useStore((s) => s.plan.levels);
  const levels = useMemo(() => sortedLevels({ levels: raw }), [raw]);
  const here = useWalk((s) => s.level);
  if (levels.length < 2) return null;
  return (
    <div className="walk-levels" role="group" aria-label="Floor">
      {levels.map((l) => (
        <button key={l.id} type="button" className="walk-chip" aria-pressed={l.id === here} onClick={() => (walkInput.level = l.id)} title={`Go to ${l.name}`}>
          {l.name}
        </button>
      ))}
    </div>
  );
}

/** My height and the head bob: two plain choices, folded away until asked for. */
function Settings() {
  const eye = useWalk((s) => s.eye);
  const bob = useWalk((s) => s.bob);
  const { setEye, setBob } = useWalk.getState();
  return (
    <div className="walk-set hud brackets" role="group" aria-label="Walk settings">
      <label>
        <span>My height: eyes at {Math.round(eye * 100)} cm</span>
        <input type="range" min={EYE_MIN} max={EYE_MAX} step={0.05} value={eye} onChange={(e) => setEye(Number(e.target.value))} />
      </label>
      <label className="walk-check">
        <input type="checkbox" checked={bob} onChange={(e) => setBob(e.target.checked)} />
        <span>Gentle head bob while walking</span>
      </label>
    </div>
  );
}

/** What the crosshair is on (or what was tapped): the device's name and what a click does. */
function Aim() {
  const aim = useWalk((s) => s.aim);
  if (!aim) return null;
  const verb = aim.action === "switch" ? "switch" : "open";
  return (
    <p className="walk-aim hud" role="status">
      <strong>{aim.name}</strong>
      {aim.action !== "none" && (
        <span>
          {aim.state ? `${aim.state} · ` : ""}
          <span className="walk-aim-key">click or E to {verb}</span>
          <span className="walk-aim-tap">tap to {verb}</span>
        </span>
      )}
    </p>
  );
}

/** The walkthrough's HUD: an Exit button, the room you are in, the floor buttons, the mini-map, "How to walk" and the touch stick. Everything else on screen is hidden while walking (WalkHud.css). */
export default function WalkHud() {
  const phase = useWalk((s) => s.phase);
  const note = useWalk((s) => s.note);
  const room = useWalk((s) => s.room);
  const map = useWalk((s) => s.map);
  const locked = useWalk((s) => s.locked);
  const seen = useWalk((s) => s.helpSeen);
  const view = useStore((s) => s.view);
  const [help, setHelp] = useState(false);
  const [settings, setSettings] = useState(false);
  const { leave, setMap, dismissHelp, setNote } = useWalk.getState();

  useEffect(() => {
    const root = document.documentElement;
    if (phase === "off") delete root.dataset.walk;
    else root.dataset.walk = phase;
    return () => void delete root.dataset.walk;
  }, [phase]);
  useEffect(() => {
    if (view !== "live") leave(); // a walk belongs to the live view
  }, [view, leave]);
  useEffect(() => {
    if (!note) return;
    const t = window.setTimeout(() => setNote(null), NOTE_MS);
    return () => window.clearTimeout(t);
  }, [note, setNote]);
  useEffect(() => {
    if (phase !== "off") return;
    setHelp(false);
    setSettings(false);
  }, [phase]);

  if (phase === "off") return note ? <p className="walk-note hud" role="status">{note}</p> : null;
  const walking = phase === "walk";
  const closeHelp = () => (dismissHelp(), setHelp(false));
  return (
    <div className="walk-hud" data-phase={phase}>
      {walking && (
        <>
          <div className="walk-bar hud">
            <button type="button" className="walk-exit" onClick={leave} title="Back to the whole home (Esc)">
              <SignOutIcon size={16} aria-hidden />
              <span>Exit walkthrough</span>
            </button>
            <span className="walk-room" aria-live="polite">{room}</span>
            <FloorButtons />
            <button type="button" className="walk-btn" aria-pressed={map} onClick={() => setMap(!map)} title="Mini-map (M)" aria-label="Mini-map">
              <MapTrifoldIcon size={16} aria-hidden />
            </button>
            <button type="button" className="walk-btn" aria-pressed={settings} onClick={() => setSettings((v) => !v)} title="My height and head bob" aria-label="Walk settings">
              <SlidersHorizontalIcon size={16} aria-hidden />
            </button>
            <button type="button" className="walk-btn walk-opt-help" aria-pressed={help} onClick={() => setHelp((v) => !v)} title="How to walk" aria-label="How to walk">
              <QuestionIcon size={16} aria-hidden />
            </button>
          </div>
          {settings && <Settings />}
          {map && <WalkMiniMap />}
          <i className="walk-reticle" aria-hidden />
          <Aim />
          {!locked && <p className="walk-hint hud">Move the mouse to look around. W A S D to walk, Esc to leave.</p>}
          <WalkJoystick />
          {(help || !seen) && <WalkHelp onClose={closeHelp} />}
        </>
      )}
    </div>
  );
}
