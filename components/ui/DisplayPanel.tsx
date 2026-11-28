"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { appliedScale, saverMinutes, SAVER_CHOICES, SAVER_STYLES, scaleOf, SLEEP_EVENT, UI_SIZE_LABEL, UI_SIZES, wakeWanted, type SaverStyle, type UiSize } from "@/lib/display";
import { setLayout, useDisplay } from "@/lib/displayStore";
import { useVp } from "@/lib/useVp";
import { useWall } from "@/lib/wallStore";
import type { WakeStatus } from "@/lib/wakeLock";
import type { LayoutChoice } from "@/lib/viewport";
import { readLayoutChoice } from "../ViewportClass";
import AlertSettings from "./AlertSettings";
import AssistSettings from "./AssistSettings";
import IconSettings from "./IconSettings";
import PressureSettings from "./PressureSettings";
import ClearOfflineCache from "./ClearOfflineCache";
import HudPanel from "./HudPanel";
import PeopleSwitch from "./PeopleSwitch";
import Segmented from "./Segmented";
import ThemePicker from "./ThemePicker";
import WallSettings from "./WallSettings";
import useRestoreFocus from "./useRestoreFocus";
import "./displayPanel.css";

const LAYOUTS: readonly LayoutChoice[] = ["auto", "compact", "regular"];
const LAYOUT_LABEL: Record<LayoutChoice, string> = { auto: "Auto", compact: "Compact", regular: "Regular" };
const STYLE_LABEL: Record<SaverStyle, string> = { clock: "Clock", dim: "Dark only" };
const WAKE_NOTE: Record<WakeStatus, string> = {
  on: "The screen will not switch itself off.",
  off: "",
  unsupported: "Not available here: the browser needs https or localhost. See the Raspberry Pi guide for the system setting.",
  blocked: "The browser said no. Battery saver or a hidden tab can cause this.",
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="disp-sec">
      <h3 className="label disp-h">{title}</h3>
      {children}
    </section>
  );
}

/** Full screen toggle. Not offered where the browser cannot do it, nor on a kiosk (unless it is already full screen). */
function FullScreenSection({ kiosk }: { kiosk: boolean }) {
  const [full, setFull] = useState(false);
  const [note, setNote] = useState("");
  const canFull = typeof document !== "undefined" && document.fullscreenEnabled;
  useEffect(() => {
    const on = () => setFull(!!document.fullscreenElement);
    on();
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  const toggle = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen({ navigationUI: "hide" });
      setNote("");
    } catch {
      setNote("The browser did not allow full screen. Tap the button again, or use the browser's own full screen option.");
    }
  };
  if (!canFull || (kiosk && !full)) return null;
  return (
    <Section title="Full screen">
      <button type="button" className="btn" onClick={() => void toggle()}>{full ? "Leave full screen" : "Go full screen"}</button>
      <p className="hint">{note || "Hides the browser's own bars."}</p>
    </Section>
  );
}

/** Display settings sheet: layout, interface size, full screen, keep screen on, screensaver. Everything is saved on this device and applies at once. */
export default function DisplayPanel({ onClose }: { onClose: () => void }) {
  const wall = useWall((s) => s.on); // the wall display replaces the dark screensaver
  const s = useDisplay();
  const { vp, kiosk } = useVp();
  const [layout, setLayoutState] = useState<LayoutChoice>(readLayoutChoice);
  const root = useRef<HTMLDivElement>(null);
  const minutes = saverMinutes(s, kiosk);
  const keepOn = wakeWanted(s, kiosk);
  const scale = appliedScale(s.size, innerWidth, innerHeight);

  useRestoreFocus();
  useEffect(() => {
    root.current?.querySelector<HTMLElement>("button")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const pickLayout = (c: LayoutChoice) => {
    setLayout(c);
    setLayoutState(c);
  };
  const sleep = () => {
    onClose();
    window.dispatchEvent(new Event(SLEEP_EVENT));
  };
  const resetAll = () => {
    s.reset();
    pickLayout("auto");
  };

  return (
    <div className="dp-scrim" ref={root} role="dialog" aria-modal="true" aria-label="Display settings" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <HudPanel title="Display" meta={`${vp === "regular" ? "Full" : "Compact"} layout`} onClose={onClose} className="disp">
        <div className="disp-body">
          <ThemePicker />

          <Section title="Layout">
            <Segmented label="Layout" value={layout} options={LAYOUTS} format={(o) => LAYOUT_LABEL[o]} onChange={pickLayout} />
            <p className="hint">Auto follows the screen size. Compact is for small touch screens.</p>
          </Section>

          <Section title="Interface size">
            <Segmented<UiSize> label="Interface size" value={s.size} options={UI_SIZES} format={(o) => UI_SIZE_LABEL[o]} onChange={s.setSize} />
            <p className="hint">{scale === scaleOf(s.size) ? "Bigger or smaller buttons and text. The 3D view stays as it is." : `This screen is too small for that size, so it stops at x${scale}.`}</p>
          </Section>

          <Section title="Turn to face the room">
            <Segmented label="Turn the view to face the room" value={s.faceRoom ? "on" : "off"} options={["off", "on"] as const} format={(o) => (o === "on" ? "On" : "Off")} onChange={(o) => s.setFaceRoom(o === "on")} />
            <p className="hint">Entering a room swings the camera to the side that shows it best. Off: it only centres and zooms.</p>
          </Section>

          <Section title="People in the home">
            <PeopleSwitch onOpen={onClose} />
          </Section>

          <AlertSettings />
          <IconSettings />
          <PressureSettings />
          <AssistSettings />

          <FullScreenSection kiosk={kiosk} />

          <Section title="Keep screen on">
            <Segmented label="Keep screen on" value={keepOn ? "on" : "off"} options={["off", "on"] as const} format={(o) => (o === "on" ? "On" : "Off")} onChange={(o) => s.setWake(o === "on")} />
            <p className="hint">{(keepOn && WAKE_NOTE[s.wakeStatus]) || "Stops the screen switching itself off. On by default on a wall display."}</p>
          </Section>

          <WallSettings onClose={onClose} />

          {!wall && (
            <Section title="Screensaver">
              <Segmented label="Screensaver after" value={String(minutes)} options={SAVER_CHOICES.map(String)} format={(o) => (o === "0" ? "Off" : `${o} min`)} onChange={(o) => s.setSaver(Number(o))} />
              {minutes > 0 && <Segmented<SaverStyle> label="Screensaver look" value={s.style} options={SAVER_STYLES} format={(o) => STYLE_LABEL[o]} onChange={s.setStyle} />}
              <p className="hint">After a while with no touch the screen goes dark and shows the time. Touch it to wake up.</p>
              {minutes > 0 && <button type="button" className="btn" onClick={sleep}>Try it now</button>}
            </Section>
          )}

          <ClearOfflineCache />
        </div>
        <footer className="dp-foot">
          <button type="button" className="btn" onClick={resetAll}>Back to defaults</button>
          <p className="hint">Setting up a wall display? See docs/small-screens.md.</p>
        </footer>
      </HudPanel>
    </div>
  );
}
