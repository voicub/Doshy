"use client";
import { ALERT_MODE_LABEL, ALERT_MODES, type AlertMode } from "@/lib/alerts";
import { useAlerts } from "@/lib/alertsStore";
import { playBeep } from "./alertBeep";
import Segmented from "./Segmented";
import "./alerts.css";

const MODE_HINT: Record<AlertMode, string> = {
  focus: "A leak, smoke, an alarm or a door left open shows a banner, takes the camera to the room and pulses red until you answer it. It never moves the camera while you are editing or touching the screen.",
  banner: "A banner at the top. The camera stays where you put it.",
  off: "No alerts are shown.",
};
const OPEN_CHOICES = [5, 15, 30, 60];

/** The Alerts rows of the Display settings. Everything is saved on this device. */
export default function AlertSettings() {
  const s = useAlerts();
  const minutes = [...new Set([...OPEN_CHOICES, s.openMinutes])].sort((a, b) => a - b);
  return (
    <section className="disp-sec">
      <h3 className="label disp-h">Alerts</h3>
      <Segmented<AlertMode> label="Alerts" value={s.mode} options={ALERT_MODES} format={(o) => ALERT_MODE_LABEL[o]} onChange={s.setMode} />
      <p className="hint">{MODE_HINT[s.mode]}</p>
      {s.mode !== "off" && (
        <details className="alert-more">
          <summary>Doors, windows and sound</summary>
          <Segmented label="Alert for a door or window left open after" value={String(s.openMinutes)} options={minutes.map(String)} format={(o) => `${o} min`} onChange={(o) => s.setOpenMinutes(Number(o))} />
          <p className="hint">A door or window that has been open this long counts as an alert.</p>
          <Segmented label="Beep" value={s.sound ? "on" : "off"} options={["off", "on"] as const} format={(o) => (o === "on" ? "Beep: on" : "Beep: off")} onChange={(o) => { s.setSound(o === "on"); if (o === "on") playBeep(); }} />
          <p className="hint">Two short tones every 20 seconds while a serious alert is waiting. The browser only allows sound after the screen has been touched once.</p>
        </details>
      )}
    </section>
  );
}
