import { MOUSE_LOOK, TOUCH_LOOK } from "@/lib/walkMove";
import { useWalk, type WalkAim } from "@/lib/walkStore";
import { addLook, resetWalkInput, walkInput } from "./walkInput";
import { REACH_CROSSHAIR, REACH_POINTER, actOn, describe, type Picker } from "./walkPick";

/** Keys that move or turn the walker. They are taken before the rest of the app sees them: W A S D and the arrows are not shortcuts while walking. */
const HELD = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ShiftLeft", "ShiftRight"]);
/** A press that moves this far (px) is a look-around, not a click. */
const CLICK_SLOP = 6;
/** A tapped device's name stays on screen this long (ms). */
const TAP_NAME_MS = 2600;

const typing = (t: EventTarget | null): boolean => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
const dialogOpen = (): boolean => document.querySelector("[role='dialog']") !== null;
/** A card, dialog or help sheet is up: the mouse is for it, so moving it does not turn the head and nothing captures it. */
const overlayOpen = (): boolean => document.querySelector("[role='dialog'], .devcard, .dc") !== null;


type Drag = { id: number; x: number; y: number; sx: number; sy: number; moved: boolean };

/**
 * Mouse, touch and keyboard for the walkthrough, on the canvas and the window. Returns the function that takes them away again.
 * Desktop: a click captures the mouse (pointer lock) and moving it looks around; where that is not possible, dragging looks around. Touch: dragging looks around.
 * Every press on the picture is checked against the walls first (walkPick.ts), so a tap cannot reach a device through a wall, and while the mouse is captured the stale
 * pointer position the browser reports is never given to the scene.
 */
export function attachWalkInput(canvas: HTMLCanvasElement, picker: Picker): () => void {
  const wrapper = canvas.parentElement ?? canvas;
  const locked = () => document.pointerLockElement === canvas;
  let drag: Drag | null = null;
  let tapped: number | undefined;
  // Like a game: moving the mouse over the picture turns the head, no click needed. Where the browser allows it the mouse is also captured (pointer lock) so the cursor never reaches
  // the edge of the screen: a key press or click is the gesture that allows it. After Esc lets go of the mouse, only a click captures it again.
  let manualFree = false;
  let byCard = false;
  const canLock = () => typeof canvas.requestPointerLock === "function" && window.matchMedia("(pointer: fine)").matches;
  const lock = () => {
    manualFree = false;
    if (canLock() && !locked()) void Promise.resolve(canvas.requestPointerLock()).catch(() => undefined);
  };
  const autoLock = () => {
    if (!manualFree && !overlayOpen()) lock();
  };

  /** Use the piece at a point of the picture (-1..1 both ways; the crosshair is 0, 0): what a tap on it does in the isometric view, and its name on screen. A guest only gets the name. */
  const use = (nx: number, ny: number, reach: number, x: number, y: number) => {
    const hit = picker.at(nx, ny, reach);
    const aim = hit && describe(hit.id);
    if (!hit || !aim) return false;
    actOn(hit.id, x, y);
    if (aim.action === "open" && locked()) {
      byCard = true; // the card needs a free mouse
      document.exitPointerLock();
    }
    showTapped(aim);
    return true;
  };
  /** Press E, or click while the mouse is captured: use what the crosshair is on. */
  const interact = () => {
    const r = canvas.getBoundingClientRect();
    use(0, 0, REACH_CROSSHAIR, r.left + r.width / 2, r.top + r.height / 2);
  };
  const showTapped = (aim: WalkAim) => {
    useWalk.getState().setAim(aim);
    walkInput.aimHold = performance.now() + TAP_NAME_MS;
    window.clearTimeout(tapped);
    tapped = window.setTimeout(() => useWalk.getState().setAim(null), TAP_NAME_MS);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (typing(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === "Escape") {
      if (!dialogOpen()) useWalk.getState().leave(); // with a card open, Esc closes the card first (the app's own handler)
      return;
    }
    const take = () => (e.preventDefault(), e.stopImmediatePropagation());
    if (HELD.has(e.code)) {
      walkInput.keys.add(e.code);
      autoLock();
      take();
    } else if (e.code === "KeyE" && !e.repeat) {
      take();
      interact();
    } else if (e.code === "KeyM" && !e.repeat) {
      take();
      useWalk.getState().setMap(!useWalk.getState().map);
    }
  };
  const onKeyUp = (e: KeyboardEvent) => void walkInput.keys.delete(e.code);

  const onDown = (e: PointerEvent) => {
    if (!e.isTrusted) return;
    if (locked()) {
      if (e.button === 0) interact();
      return;
    }
    if (e.target !== canvas || drag || (e.pointerType === "mouse" && e.button !== 0)) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false };
  };
  const onMove = (e: PointerEvent) => {
    if (!e.isTrusted) return;
    if (locked()) return addLook(e.movementX, e.movementY, MOUSE_LOOK);
    if (e.pointerType === "mouse") {
      if ((e.target === canvas || drag) && !overlayOpen()) addLook(e.movementX, e.movementY, MOUSE_LOOK);
      if (drag && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > CLICK_SLOP) drag.moved = true;
      return;
    }
    if (!drag || drag.id !== e.pointerId) return;
    addLook(e.clientX - drag.x, e.clientY - drag.y, TOUCH_LOOK);
    [drag.x, drag.y] = [e.clientX, e.clientY];
    if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > CLICK_SLOP) drag.moved = true;
  };
  const onUp = (e: PointerEvent) => {
    if (!e.isTrusted || !drag || drag.id !== e.pointerId) return;
    const tap = !drag.moved && e.type === "pointerup";
    drag = null;
    if (!tap) return;
    const r = canvas.getBoundingClientRect();
    if (use(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1), REACH_POINTER, e.clientX, e.clientY)) return;
    // a plain click on nothing in particular captures the mouse
    if (e.pointerType === "mouse") lock();
  };

  /** Capture phase on the canvas's wrapper: the scene's own item handlers (which toggle through the isometric rules, with no idea of walls) never hear a press while walking; `use` above does it, checked against the walls. */
  const guard = (e: Event) => void e.stopPropagation();

  const onLock = () => {
    useWalk.getState().setLocked(locked());
    if (!locked()) manualFree = !byCard && !overlayOpen(); // let go with Esc (or by the browser): keys do not capture it again; a card that needed the mouse is not "letting go"
    byCard = false;
  };
  const clear = () => walkInput.keys.clear();

  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("keyup", onKeyUp, true);
  window.addEventListener("pointerdown", onDown, true);
  window.addEventListener("pointermove", onMove, true);
  window.addEventListener("pointerup", onUp, true);
  window.addEventListener("pointercancel", onUp, true);
  window.addEventListener("blur", clear);
  document.addEventListener("pointerlockchange", onLock);
  const guarded = ["pointerdown", "pointerup", "click", "contextmenu"] as const;
  for (const t of guarded) wrapper.addEventListener(t, guard, true);
  picker.refresh();
  autoLock(); // the walk usually starts from a click: if the browser still counts it, the mouse is captured at once


  return () => {
    window.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("keyup", onKeyUp, true);
    window.removeEventListener("pointerdown", onDown, true);
    window.removeEventListener("pointermove", onMove, true);
    window.removeEventListener("pointerup", onUp, true);
    window.removeEventListener("pointercancel", onUp, true);
    window.removeEventListener("blur", clear);
    document.removeEventListener("pointerlockchange", onLock);
    for (const t of guarded) wrapper.removeEventListener(t, guard, true);
    window.clearTimeout(tapped);
    if (locked()) document.exitPointerLock();
    useWalk.getState().setLocked(false);
    resetWalkInput();
  };
}
