"use client";
import { useThree } from "@react-three/fiber";
import { useEffect, type RefObject } from "react";
import { Raycaster, type Group } from "three";
import { LONG_PRESS_PX } from "@/lib/pickMath";
import { cursor, placing, rankAt, st, ui, type Ctx } from "./controllerCtx";
import { apply, beginAt, CLICK_PX, finish } from "./controllerGesture";
import { armLong, cancelLong, clickSelect, cycleHere, hideTip, scheduleHover, tabSelect } from "./controllerPick";
import { installTouchPlacement, place, updateGhost } from "./controllerPlace";
import { useEditUi } from "./editStore";
import { useFlowUi } from "./flowUi";
import { pickBridge } from "./pickBridge";
import { isCoarse } from "./pointerKind";

export const KIND_MIME = "application/x-housey-kind";

const typing = (t: EventTarget | null) => t instanceof Element && !!t.closest("input,textarea,select,button,a,[contenteditable],[role=dialog],[role=listbox],[role=menu]");

function onDown(c: Ctx, e: PointerEvent) {
  if (e.button !== 0 || c.active) return;
  hideTip(c);
  if (!e.isPrimary) {
    // a second finger: the camera takes it as orbit / pinch, nothing here
    cancelLong(c);
    c.press = null;
    return;
  }
  c.downAlt = e.altKey;
  c.sticky = false;
  ui().set({ lastPress: { x: e.clientX, y: e.clientY } });
  armLong(c, e);
  if (c.furniture && !st().tool.startsWith("add:") && beginAt(c, e)) return;
  const flow = !c.furniture && useFlowUi.getState().on;
  c.press = { x: e.clientX, y: e.clientY, hit: flow ? (rankAt(c, e)[0] ?? null) : null, shift: e.shiftKey, alt: e.altKey };
}

function onMove(c: Ctx, e: PointerEvent) {
  const { lp, ptr } = c;
  if (lp && e.isPrimary && Math.hypot(e.clientX - lp.x, e.clientY - lp.y) > LONG_PRESS_PX) cancelLong(c);
  if (c.active || e.buttons) hideTip(c);
  if (c.active) {
    c.pending = e;
    c.raf ||= requestAnimationFrame(() => {
      c.raf = 0;
      if (c.pending) apply(c, c.pending);
      c.pending = null;
    });
    return;
  }
  if (e.buttons) return; // the camera is being orbited or panned
  if (e.target !== c.el) {
    hideTip(c);
    ptr.inside = false;
    const u = ui();
    if (u.hover || u.hoverGizmo || u.hoverMore) u.set({ hover: null, hoverGizmo: null, hoverMore: 0 });
    if (u.ghost && !u.dragKind) u.set({ ghost: null });
    return;
  }
  if (c.furniture && placing()) {
    updateGhost(c, e, placing());
    cursor(c, "copy");
    return;
  }
  ptr.clientX = e.clientX;
  ptr.clientY = e.clientY;
  ptr.pointerType = e.pointerType;
  ptr.inside = true;
  scheduleHover(c);
}

function onUp(c: Ctx, e: PointerEvent) {
  cancelLong(c);
  const a = c.active;
  if (a) {
    if (c.pending) apply(c, c.pending);
    const click = a.mode === "move" && !a.started && !a.changed && e.button === 0 && e.isPrimary; // pressed an item and let go without dragging
    finish(c, false);
    if (click) clickSelect(c, e, c.downAlt, c.sticky);
    return;
  }
  const p = c.press;
  c.press = null;
  if (!p || e.button !== 0 || Math.hypot(e.clientX - p.x, e.clientY - p.y) >= CLICK_PX) return;
  const placingKind = placing();
  if (c.furniture && placingKind) {
    if (isCoarse() && e.pointerType !== "mouse" && !ui().dragKind) {
      updateGhost(c, e, placingKind); // a finger taps where it should go; the placement bar confirms
      return;
    }
    place(c, placingKind, e.shiftKey, e);
    return;
  }
  if (!c.furniture && useFlowUi.getState().on) {
    // the Connect tool: items are the two ends of a line, everything else is ignored
    if (p.hit?.type === "item") useFlowUi.getState().pick(p.hit.id);
    return;
  }
  clickSelect(c, e, p.alt);
}

function onCancel(c: Ctx) {
  cancelLong(c);
  c.press = null;
  finish(c, true);
}

function onKey(c: Ctx, e: KeyboardEvent) {
  if (e.key === "Escape" && c.active) return e.stopImmediatePropagation(), finish(c, true);
  if (e.key === "Tab" && c.furniture && !e.ctrlKey && !e.metaKey && !e.altKey && !typing(e.target) && tabSelect(c, e)) e.preventDefault();
}

function onDragOver(c: Ctx, e: DragEvent) {
  if (!c.furniture || !ui().dragKind) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  updateGhost(c, e, ui().dragKind);
}

function onDrop(c: Ctx, e: DragEvent) {
  const kind = ui().dragKind ?? e.dataTransfer?.getData(KIND_MIME);
  if (!c.furniture || !kind) return;
  e.preventDefault();
  place(c, kind, false, e);
  ui().set({ dragKind: null, ghost: null });
}

/** Wires every pointer / key / drag listener of one Controller to `c`; returns the teardown. */
function listen(c: Ctx): () => void {
  const { el } = c;
  const down = (e: PointerEvent) => onDown(c, e);
  const move = (e: PointerEvent) => onMove(c, e);
  const up = (e: PointerEvent) => onUp(c, e);
  const cancel = () => onCancel(c);
  const key = (e: KeyboardEvent) => onKey(c, e);
  const over = (e: DragEvent) => onDragOver(c, e);
  const leave = () => ui().ghost && ui().set({ ghost: null });
  const drop = (e: DragEvent) => onDrop(c, e);
  el.addEventListener("pointerdown", down, true);
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", cancel);
  window.addEventListener("blur", cancel);
  window.addEventListener("keydown", key, true);
  el.addEventListener("dragover", over);
  el.addEventListener("dragleave", leave);
  el.addEventListener("drop", drop);
  return () => {
    el.removeEventListener("pointerdown", down, true);
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", cancel);
    window.removeEventListener("blur", cancel);
    window.removeEventListener("keydown", key, true);
    el.removeEventListener("dragover", over);
    el.removeEventListener("dragleave", leave);
    el.removeEventListener("drop", drop);
  };
}

/**
 * Pointer logic of the 3D editing views, on the canvas element in the capture phase so the camera controls can be switched off
 * before they see the press. `furniture`: pick, drag, rotate and lift furniture, place catalog items. `ha`: click to select only, nothing moves.
 */
export default function Controller({ mode, proxies }: { mode: "furniture" | "ha"; proxies: RefObject<Group | null> }) {
  const gl = useThree((s) => s.gl);
  const get = useThree((s) => s.get);

  useEffect(() => {
    const caster = new Raycaster();
    const c: Ctx = {
      el: gl.domElement,
      get,
      proxies,
      furniture: mode === "furniture",
      caster,
      rayObj: { o: caster.ray.origin, d: caster.ray.direction }, // the Raycaster aims this Ray in place
      active: null,
      press: null,
      pending: null,
      cycle: null,
      lp: null,
      tipTimer: 0,
      downAlt: false,
      raf: 0,
      ptr: { clientX: 0, clientY: 0, pointerType: "mouse", inside: false },
      hoverRaf: 0,
      sticky: false,
    };
    pickBridge.cycleHere = () => cycleHere(c);
    const unsubTool = installTouchPlacement(c);
    const unlisten = listen(c);
    return () => {
      finish(c, false); // leaving mid-gesture must not leave an edit open
      unlisten();
      cursor(c, "");
      cancelLong(c);
      hideTip(c);
      cancelAnimationFrame(c.hoverRaf);
      pickBridge.cycleHere = null;
      pickBridge.confirmPlace = null;
      unsubTool();
      useEditUi.getState().set({ hover: null, hoverGizmo: null, hoverMore: 0, ghost: null, gesture: null, clearance: null, snap: null, cycle: null, chooser: null });
    };
  }, [gl, get, mode, proxies]);

  return null;
}
