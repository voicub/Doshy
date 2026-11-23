"use client";
import { CheckIcon, PauseIcon, PlayIcon, StopIcon } from "@phosphor-icons/react";
import { ago } from "@/lib/running";
import { durationWords, programLabel, readyAbout, remainingWords, type WashView } from "@/lib/washdata";
import MonoLabel from "./MonoLabel";

const fmtNum = (n: number, digits = 2) => String(Math.round(n * 10 ** digits) / 10 ** digits);
const fmtW = (w: number) => `${w >= 100 ? Math.round(w) : Math.round(w * 10) / 10} W`;

/** What a finished or running cycle looks like in one line: "32 min left, ready about 21:45" / "Finished 12 min ago". */
export function timing(v: WashView): string | undefined {
  if (v.phase === "running" && v.remainingMin !== undefined && v.state !== "ending") return `${remainingWords(v.remainingMin)}${v.readyAt ? `, ${readyAbout(v.readyAt)}` : ""}`;
  if (v.phase === "paused" && v.remainingMin !== undefined) return `${remainingWords(v.remainingMin)} once it carries on`;
  if (v.phase === "done" && v.finishedAt) return `Finished ${ago(Date.now() - v.finishedAt)}`;
  return undefined;
}

/** The detail rows: program, phase, power now, last cycle and totals (only the ones WashData reports). */
export function WashFacts({ v }: { v: WashView }) {
  const last = v.lastCycle;
  const lastText = last ? [last.minutes !== undefined ? durationWords(last.minutes) : "", last.kwh !== undefined ? `${fmtNum(last.kwh)} kWh` : "", last.cost !== undefined ? `${fmtNum(last.cost)}${last.currency ? ` ${last.currency}` : ""}` : ""].filter(Boolean).join(", ") : "";
  const totals = [v.cycleCount !== undefined ? `${fmtNum(v.cycleCount, 0)} ${v.cycleCount === 1 ? "cycle" : "cycles"}` : "", v.energyKwh !== undefined ? `${fmtNum(v.energyKwh)} kWh` : ""].filter(Boolean).join(", ");
  return (
    <dl className="wc-facts">
      {v.program && (<><dt>Program</dt><dd>{programLabel(v.program)}</dd></>)}
      {v.phaseName && v.inCycle && (<><dt>Phase</dt><dd>{programLabel(v.phaseName)}</dd></>)}
      {v.powerW !== undefined && (<><dt>Power now</dt><dd>{fmtW(v.powerW)}</dd></>)}
      {lastText && (<><dt>Last cycle</dt><dd>{lastText}</dd></>)}
      {totals && (<><dt>Totals</dt><dd>{totals}</dd></>)}
    </dl>
  );
}

/** Pause / Resume / Mark unloaded / Force end (with its confirmation). A button shows only when WashData offers it right now. */
export function WashControls({ v, confirmEnd, setConfirmEnd, onPress }: { v: WashView; confirmEnd: boolean; setConfirmEnd: (on: boolean) => void; onPress: (entity: string | undefined, what: string, next: string) => void }) {
  const { pause, resume, forceEnd, markUnloaded } = v.controls;
  const hasControls = !!(pause || resume || forceEnd || markUnloaded);
  return (
    <>
      {hasControls && (
        <div className="wc-controls" role="group" aria-label="Controls">
          {pause && <button type="button" className="btn dc-btn" onClick={() => void onPress(pause, "pause it", "user_paused")}><PauseIcon size={14} aria-hidden /> Pause</button>}
          {resume && <button type="button" className="btn dc-btn" onClick={() => void onPress(resume, "resume it", "running")}><PlayIcon size={14} aria-hidden /> Resume</button>}
          {markUnloaded && <button type="button" className="btn dc-btn" onClick={() => void onPress(markUnloaded, "mark it unloaded", "finished")}><CheckIcon size={14} aria-hidden /> Mark unloaded</button>}
          {forceEnd && !confirmEnd && <button type="button" className="btn dc-btn danger" onClick={() => setConfirmEnd(true)}><StopIcon size={14} aria-hidden /> Force end</button>}
        </div>
      )}
      {confirmEnd && forceEnd && (
        <div className="wc-confirm" role="alertdialog" aria-label="Force end the cycle">
          <p>End the cycle now? WashData will stop following it. The machine itself keeps going.</p>
          <div className="wc-controls">
            <button type="button" className="btn dc-btn danger" onClick={() => { setConfirmEnd(false); void onPress(forceEnd, "end the cycle", "force_stopped"); }}>Yes, end it</button>
            <button type="button" className="btn dc-btn" onClick={() => setConfirmEnd(false)}>Keep going</button>
          </div>
        </div>
      )}
    </>
  );
}

/** Which program WashData should expect. The program that is currently selected stays listed even if WashData does not offer it. */
export function ProgramSelect({ v, onChoose }: { v: WashView; onChoose: (option: string) => void }) {
  const options = v.controls.program && v.programs.length ? (v.selectedProgram && !v.programs.includes(v.selectedProgram) ? [v.selectedProgram, ...v.programs] : v.programs) : [];
  if (options.length === 0) return null;
  return (
    <label className="wc-program">
      <MonoLabel>Program</MonoLabel>
      <select value={v.selectedProgram ?? ""} onChange={(e) => void onChoose(e.target.value)} aria-label="Program WashData should expect">
        {options.map((o) => <option key={o} value={o}>{programLabel(o)}</option>)}
      </select>
    </label>
  );
}
