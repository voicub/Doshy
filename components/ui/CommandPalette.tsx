"use client";
import { MagnifyingGlassIcon, XIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import DisplayHint from "./DisplayHint";
import MonoLabel from "./MonoLabel";
import useRestoreFocus from "./useRestoreFocus";
import { score, useCommands, type Cmd, type Handlers, type PaletteMode } from "./paletteCommands";
import { AskResult, Mic, useAsk } from "./CommandBox";
import "./palette.css";

/** The matching commands, grouped under headings (a heading shows where the group changes). */
function ResultList({ results, active, q, list, onHover, onRun }: { results: Cmd[]; active: number; q: string; list: RefObject<HTMLDivElement | null>; onHover: (i: number) => void; onRun: (c: Cmd) => void }) {
  return (
    <div className="palette-list" id="cmd-list" role="listbox" aria-label="Results" ref={list}>
      {results.map((c, i) => (
        <div key={c.id} role="presentation">
          {c.group !== results[i - 1]?.group && <MonoLabel className="cmd-group">{c.group}</MonoLabel>}
          <div
            id={`cmd-${c.id}`}
            role="option"
            aria-selected={i === active}
            className="cmd"
            onMouseMove={() => i !== active && onHover(i)}
            onClick={() => onRun(c)}
          >
            <span className="cmd-label">{c.label}</span>
            {c.meta && (
              <span className="cmd-meta">
                {c.color && <i className={c.on ? "on" : ""} style={{ ["--c" as string]: c.color }} />}
                {c.meta}
              </span>
            )}
          </div>
        </div>
      ))}
      {!results.length && <div className="palette-empty">{`No match for "${q}"`}</div>}
    </div>
  );
}

export default function CommandPalette({ onClose, ...handlers }: { onClose: () => void } & Handlers) {
  const [mode, setMode] = useState<PaletteMode>("all"); // "Open device card..." and "Switch plan..." narrow the list
  const narrow = useCallback((next: PaletteMode) => { setMode(next); setQ(""); setIdx(0); }, []);
  const all = useCommands(handlers, mode, narrow);
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const asking = mode === "ask";
  const ask = useAsk(asking ? q : "");

  const results = useMemo(() => {
    const scored = all.map((c, i) => ({ c, i, s: score(q, c.hay) }));
    const best = Math.max(...scored.map((x) => x.s), 0);
    // loose in-order matches only show up when nothing matches as a substring
    return scored.filter((x) => x.s > 0 && (best < 2 || x.s >= 2)).sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.c);
  }, [all, q]);
  const active = Math.min(idx, Math.max(results.length - 1, 0));

  useRestoreFocus();
  // Not on every new `results` array: the command list is rebuilt whenever the home's state ticks, and each rebuild pulled the list back to the selected row under a finger that had scrolled away.
  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active, q, mode]);

  const run = (c: Cmd | undefined, card = false) => {
    if (!c) return;
    if (c.stay) return c.run(); // narrows this palette instead of closing it
    onClose();
    (card && c.card ? c.card : c.run)();
  };

  const onKey = (e: KeyboardEvent) => {
    const n = results.length;
    if (e.key === "Escape") { e.preventDefault(); onClose(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setIdx(n ? (active + 1) % n : 0); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setIdx(n ? (active - 1 + n) % n : 0); }
    else if (e.key === "Home") { e.preventDefault(); setIdx(0); }
    else if (e.key === "End") { e.preventDefault(); setIdx(Math.max(n - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (asking) { if (ask.confirm()) onClose(); } else run(results[active], e.shiftKey); }
    else if (e.key === "Tab" && !asking) e.preventDefault(); // Assist has real controls that keyboard users must reach
  };

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette hud brackets" role="dialog" aria-modal="true" aria-label="Command palette">
        <div className="palette-input">
          <MagnifyingGlassIcon size={16} />
          <input
            autoFocus
            {...(asking ? {} : { role: "combobox", "aria-expanded": true, "aria-controls": "cmd-list", "aria-autocomplete": "list" as const, "aria-activedescendant": results[active] ? `cmd-${results[active].id}` : undefined })}
            aria-label={asking ? "Tell Doshy what to do" : "Search rooms, lights, appliances and actions"}
            placeholder={asking ? 'Say it in plain words, like "turn off the lights in the bedroom"' : mode === "cards" ? "Pick a device to open its card" : mode === "plans" ? "Pick a plan to show" : "Search rooms, lights, appliances, actions"}
            value={q}
            onChange={(e) => { setQ(e.target.value); setIdx(0); }}
            onKeyDown={onKey}
            spellCheck={false}
            autoComplete="off"
          />
          {asking && <Mic onText={(t) => { setQ(t); setIdx(0); }} />}
          <button type="button" className="icon-btn palette-close" aria-label="Close search" onClick={onClose}><XIcon size={16} /></button>
        </div>
        {asking ? (
          <AskResult ask={ask} onExample={(t) => setQ(t)} onDone={onClose} />
        ) : (
          <ResultList results={results} active={active} q={q} list={list} onHover={setIdx} onRun={run} />
        )}
        <div className="palette-foot" aria-hidden>
          {asking ? (
            <>
              <span><b>ENTER</b>Confirm</span>
              <span><b>ESC</b>Close</span>
            </>
          ) : (
            <>
              <span><b>UP DOWN</b>Navigate</span>
              <span><b>ENTER</b>Run</span>
              <span><b>SHIFT ENTER</b>Device card</span>
              <span><b>ESC</b>Close</span>
            </>
          )}
        </div>
        <DisplayHint />
      </div>
    </div>
  );
}