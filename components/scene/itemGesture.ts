import { useEffect, useRef } from "react";

const LONG_PRESS_MS = 500;
const MOVE_CANCEL_PX = 6;

export const openDevice = (entity: string, x: number, y: number) => window.dispatchEvent(new CustomEvent("housey:device", { detail: { entity, x, y } }));

/** Right-click, Shift+click or a 500 ms press opens the device card instead of toggling. A press that turns into a drag (orbiting the house, or a finger moving) does neither. */
export type DeviceGesture = {
  start(x: number, y: number): void;
  cancel(): void;
  menu(x: number, y: number): void;
  /** For a click: true when it should do the plain action (toggle). */
  tap(shift: boolean, x: number, y: number): boolean;
};

export function useDeviceGesture(entity?: string): DeviceGesture {
  const timer = useRef<number | undefined>(undefined);
  const fired = useRef(false);
  const origin = useRef<{ x: number; y: number } | null>(null); // where the press began; null once a click consumed it (a keyboard click has none)
  const unwatch = useRef<(() => void) | undefined>(undefined);
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      unwatch.current?.();
    },
    [],
  );
  const cancel = () => {
    clearTimeout(timer.current);
    unwatch.current?.();
    unwatch.current = undefined;
  };
  return {
    start(x: number, y: number) {
      cancel();
      fired.current = false;
      origin.current = { x, y };
      if (entity) timer.current = window.setTimeout(() => ((fired.current = true), openDevice(entity, x, y)), LONG_PRESS_MS);
      // the pointer leaves the item as the camera orbits, so item handlers stop hearing it: watch the window until the press ends
      const move = (e: PointerEvent) => Math.hypot(e.clientX - x, e.clientY - y) > MOVE_CANCEL_PX && clearTimeout(timer.current);
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", cancel);
      window.addEventListener("pointercancel", cancel);
      unwatch.current = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", cancel);
        window.removeEventListener("pointercancel", cancel);
      };
    },
    cancel,
    menu(x: number, y: number) {
      if (entity) openDevice(entity, x, y);
    },
    // a click that ends away from where the press began was a drag
    tap(shift: boolean, x: number, y: number) {
      clearTimeout(timer.current);
      const o = origin.current;
      origin.current = null;
      if (fired.current) return (fired.current = false);
      if (o && Math.hypot(x - o.x, y - o.y) > MOVE_CANCEL_PX) return false;
      if (shift && entity) return openDevice(entity, x, y), false;
      return true;
    },
  };
}
