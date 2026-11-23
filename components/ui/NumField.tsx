"use client";
import { MinusIcon, PlusIcon } from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useStore } from "@/lib/store";
import MonoLabel from "./MonoLabel";
import "./numField.css";

type Props = {
  label: string;
  unit: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  /** Apply every valid keystroke (default). Off: apply on Enter / blur / arrow keys / the - and + buttons, for values where half-typed numbers do harm. */
  live?: boolean;
  readOnly?: boolean;
  invalid?: boolean;
  /** The - and + buttons that compact and touch screens show (numField.css hides them for a mouse). Off where the field sits between buttons of its own. */
  steppers?: boolean;
};

const NUMBER = /^-?(\d+\.?\d*|\.\d+)$/;
const parse = (s: string) => (NUMBER.test(s.trim().replace(",", ".")) ? Number(s.trim().replace(",", ".")) : null);
const show = (v: number) => String(Number(v.toFixed(3)));
const HOLD_MS = 400; // press and hold: after this long the button repeats
const REPEAT_MS = 90;

/** Fingers and small screens (not a desktop mouse) select all of a tapped field, so typing replaces the number. */
const selectOnFocus = (el: HTMLInputElement) => {
  const d = document.documentElement.dataset;
  if (d.vp === "tiny" || d.vp === "small" || d.coarse === "1") el.select();
};

/**
 * One - or + button. A tap steps once; holding repeats and the whole hold is one undo step. The step fires on release, so a finger that
 * starts scrolling the sheet over a button (the browser then cancels the pointer) changes nothing.
 */
function StepButton({ dir, label, disabled, bump }: { dir: 1 | -1; label: string; disabled?: boolean; bump: (dir: 1 | -1) => void }) {
  const bumpRef = useRef(bump);
  const timers = useRef<{ wait?: number; tick?: number; began: boolean; repeating: boolean }>({ began: false, repeating: false });
  useEffect(() => {
    bumpRef.current = bump;
  });

  const stop = () => {
    const t = timers.current;
    window.clearTimeout(t.wait);
    window.clearInterval(t.tick);
    t.wait = t.tick = undefined;
    if (t.began) useStore.getState().endEdit();
    t.began = t.repeating = false;
  };
  useEffect(() => stop, []);

  const press = () => {
    stop();
    timers.current.wait = window.setTimeout(() => {
      const t = timers.current;
      t.repeating = true;
      if (!useStore.getState().gesture) {
        useStore.getState().beginEdit();
        t.began = true;
      }
      bumpRef.current(dir);
      t.tick = window.setInterval(() => bumpRef.current(dir), REPEAT_MS);
    }, HOLD_MS);
  };
  const release = () => {
    const wasHold = timers.current.repeating;
    const pending = timers.current.wait !== undefined;
    stop();
    if (pending && !wasHold) bumpRef.current(dir);
  };

  return (
    <button
      type="button"
      className="num-step"
      aria-label={`${dir < 0 ? "Decrease" : "Increase"} ${label}`}
      disabled={disabled}
      onPointerDown={(e) => e.button === 0 && press()}
      onPointerUp={release}
      onPointerCancel={stop}
      onPointerLeave={stop}
      onClick={(e) => e.detail === 0 && bumpRef.current(dir)} // keyboard and screen reader activation (a pointer click has detail >= 1 and was handled on release)
      onContextMenu={(e) => e.preventDefault()}
    >
      {dir < 0 ? <MinusIcon size={18} aria-hidden /> : <PlusIcon size={18} aria-hidden />}
    </button>
  );
}

/**
 * Mono numeric field with a unit suffix. It keeps what the user typed while editing (so "1." and a value the store
 * clamps do not fight the caret) and shows the real value again on blur. Arrow keys step, Shift steps x10; compact and touch
 * screens also get - and + buttons that step the same way.
 */
export default function NumField({ label, unit, value, onChange, step = 0.05, min, max, live = true, readOnly, invalid, steppers = true }: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  const id = useId();

  const commit = (v: number) => {
    const lo = min ?? -Infinity;
    const hi = max ?? Infinity;
    onChange(Math.min(hi, Math.max(lo, Math.round(v * 1e6) / 1e6)));
  };
  /** The typed number if it parses, else the stored value, moved by `n` steps. Shared by arrow keys and the buttons. */
  const stepBy = (n: number) => {
    const base = (draft === null ? null : parse(draft)) ?? value;
    commit(base + n * step);
    setDraft(null);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (readOnly) return;
    if (e.key === "Enter") {
      const v = draft === null ? null : parse(draft);
      if (v !== null && !live) commit(v);
      setDraft(null);
    } else if (e.key === "Escape") {
      setDraft(null);
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      stepBy((e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? 10 : 1));
    }
  };

  return (
    <div className={steppers ? "field numf has-steps" : "field numf"}>
      <label htmlFor={id}><MonoLabel>{label}</MonoLabel></label>
      <span className="num">
        {steppers && <StepButton dir={-1} label={label} disabled={readOnly} bump={stepBy} />}
        <input
          id={id}
          type="text"
          inputMode="decimal"
          enterKeyHint="done"
          role="spinbutton"
          aria-valuenow={value}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-invalid={invalid || undefined}
          readOnly={readOnly}
          aria-readonly={readOnly || undefined}
          value={draft ?? show(value)}
          onFocus={(e) => !readOnly && selectOnFocus(e.currentTarget)}
          onChange={(e) => {
            setDraft(e.target.value);
            const v = parse(e.target.value);
            if (live && v !== null) commit(v);
          }}
          onBlur={() => {
            const v = draft === null ? null : parse(draft);
            if (v !== null && !live) commit(v);
            setDraft(null);
          }}
          onKeyDown={onKey}
        />
        <i>{unit}</i>
        {steppers && <StepButton dir={1} label={label} disabled={readOnly} bump={stepBy} />}
      </span>
    </div>
  );
}
