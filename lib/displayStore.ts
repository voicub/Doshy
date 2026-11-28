// Display settings store (interface size, keep-screen-on, screensaver) plus the live state the Display panel shows. Persisted per device.
// The layout choice is separate: lib/viewport.ts LAYOUT_KEY, written by `setLayout` below. Pure rules: lib/display.ts.
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { appliedScale, cleanDisplay, DISPLAY_DEFAULTS, effectiveSize, type DisplaySettings, type SaverStyle, type UiSize } from "./display";
import type { PressurePref } from "./pressure";
import type { WakeStatus } from "./wakeLock";
import { LAYOUT_KEY, type LayoutChoice } from "./viewport";

type DisplayState = DisplaySettings & {
  /** Live, not persisted. */
  wakeStatus: WakeStatus;
  /** The screensaver is showing. */
  idle: boolean;
  setSize: (size: UiSize) => void;
  setWake: (on: boolean) => void;
  setSaver: (minutes: number) => void;
  setStyle: (style: SaverStyle) => void;
  setFaceRoom: (on: boolean) => void;
  setPressureUnit: (unit: PressurePref) => void;
  reset: () => void;
};

export const useDisplay = create<DisplayState>()(
  persist(
    (set) => ({
      ...DISPLAY_DEFAULTS,
      wakeStatus: "off",
      idle: false,
      setSize: (size) => set({ size }),
      setWake: (wake) => set({ wake }),
      setSaver: (saver) => set({ saver }),
      setStyle: (style) => set({ style }),
      setFaceRoom: (faceRoom) => set({ faceRoom }),
      setPressureUnit: (pressureUnit) => set({ pressureUnit }),
      reset: () => set({ ...DISPLAY_DEFAULTS }),
    }),
    {
      name: "housey-display",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ size: s.size, wake: s.wake, saver: s.saver, style: s.style, faceRoom: s.faceRoom, pressureUnit: s.pressureUnit }),
      merge: (stored, current) => ({ ...current, ...cleanDisplay(stored) }),
    },
  ),
);

/** Saves the layout choice and tells ViewportClass (`housey:layout`). "auto" removes the key. */
export function setLayout(choice: LayoutChoice) {
  try {
    if (choice === "auto") localStorage.removeItem(LAYOUT_KEY);
    else localStorage.setItem(LAYOUT_KEY, choice);
  } catch {
    // storage blocked (private mode): the choice cannot be kept, Auto stays in force
  }
  window.dispatchEvent(new Event("housey:layout"));
}

/** The zoom of the HUD right now (1 unless the owner chose another interface size). */
export const hudScale = (): number => appliedScale(useDisplay.getState().size, innerWidth, innerHeight);

/** The screen in HUD pixels: what `innerWidth` / `innerHeight` mean inside the zoomed HUD, and `clientX / hudScale()` is a pointer position there. Use these for popovers that place themselves in pixels. */
export const hudViewport = (): { width: number; height: number } => effectiveSize(innerWidth, innerHeight, hudScale());
