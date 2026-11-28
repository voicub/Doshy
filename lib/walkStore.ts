import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { dbStorage } from "./dbClient";
import { useStore } from "./store";
import { EYE_DEFAULT, clampEye } from "./walkMove";

/** off: not walking. enter: the camera is flying in from the isometric view. walk: first person. exit: flying back out. */
export type WalkPhase = "off" | "enter" | "walk" | "exit";

/** What the crosshair (or a tap) is on: a device's name, its state, and what a click or the E key does to it. A guest sees the name only. */
export type WalkAim = { name: string; state: string; action: "switch" | "open" | "none" };

/** Where the walker is, for the mini-map: published a few times a second, not every frame. */
export const useWalkPose = create<{ x: number; y: number; yaw: number }>(() => ({ x: 0, y: 0, yaw: 0 }));

const storage = dbStorage("housey-walk", "settings", 0);

/** What the dashboard looked like before the walk, so leaving puts it back: Room mode and its focus, the storey being worked on, the manual cut-away. */
type Before = { isolatedRoom: string | null; focusRoom: string | null; activeLevel: string; cutaway: boolean };
let before: Before | null = null;

type WalkState = {
  phase: WalkPhase;
  /** The room the walk starts in; null = just inside the front door. */
  from: string | null;
  /** The storey being walked and the name of the room under the feet. */
  level: string;
  room: string;
  aim: WalkAim | null;
  /** A short plain sentence when a walk could not start. */
  note: string | null;
  /** The mouse is captured (pointer lock): the HUD says how to let go. */
  locked: boolean;
  /** My height (m), the head bob, the mini-map and the "How to walk" card: remembered. */
  eye: number;
  bob: boolean;
  map: boolean;
  helpSeen: boolean;
  begin: (roomId?: string | null) => void;
  arrived: () => void;
  leave: () => void;
  finished: () => void;
  setLevel: (id: string) => void;
  setRoom: (name: string) => void;
  setAim: (a: WalkAim | null) => void;
  setNote: (n: string | null) => void;
  setLocked: (on: boolean) => void;
  setEye: (m: number) => void;
  setBob: (on: boolean) => void;
  setMap: (on: boolean) => void;
  dismissHelp: () => void;
};

export const useWalk = create<WalkState>()(
  persist(
    (set, get) => ({
      phase: "off",
      from: null,
      level: "",
      room: "",
      aim: null,
      note: null,
      locked: false,
      eye: EYE_DEFAULT,
      bob: true,
      map: true,
      helpSeen: false,
      begin: (roomId = null) => {
        if (get().phase !== "off") return;
        const plan = useStore.getState();
        if (plan.view !== "live") plan.setView("live");
        const s = useStore.getState();
        before = { isolatedRoom: s.isolatedRoom, focusRoom: s.focusRoom, activeLevel: s.activeLevel, cutaway: s.cutaway };
        // Room mode, the room focus, the manual cut-away and cinema bars would each hide or cut the very walls a walker stands among
        useStore.setState({ isolatedRoom: null, focusRoom: null, cutaway: false, cinema: false, sel: null });
        set({ phase: "enter", from: roomId, level: s.activeLevel, room: "", aim: null, note: null, locked: false });
      },
      arrived: () => set((s) => (s.phase === "enter" ? { phase: "walk" } : {})),
      leave: () => {
        if (get().phase === "off" || get().phase === "exit") return;
        if (before) useStore.setState(before);
        before = null;
        set({ phase: "exit", aim: null });
      },
      finished: () => {
        before = null;
        set({ phase: "off", aim: null, locked: false });
      },
      setLevel: (level) => {
        if (get().level === level) return;
        set({ level });
        useStore.setState({ activeLevel: level }); // the level chip and every "active storey" reader follow the walker
      },
      setRoom: (room) => get().room !== room && set({ room }),
      setAim: (aim) => {
        const a = get().aim;
        if (a?.name !== aim?.name || a?.state !== aim?.state || a?.action !== aim?.action) set({ aim });
      },
      setNote: (note) => set({ note }),
      setLocked: (locked) => set({ locked }),
      setEye: (m) => set({ eye: clampEye(m) }),
      setBob: (bob) => set({ bob }),
      setMap: (map) => set({ map }),
      dismissHelp: () => set({ helpSeen: true }),
    }),
    {
      name: "housey-walk",
      storage: createJSONStorage(() => storage),
      partialize: (s) => ({ eye: s.eye, bob: s.bob, map: s.map, helpSeen: s.helpSeen }),
      merge: (saved, current) => {
        const p = (typeof saved === "object" && saved !== null ? saved : {}) as Record<string, unknown>; // the saved settings are an outside blob: each field is checked, junk falls back to the defaults
        return {
          ...current,
          eye: clampEye(p.eye),
          bob: typeof p.bob === "boolean" ? p.bob : current.bob,
          map: typeof p.map === "boolean" ? p.map : current.map,
          helpSeen: p.helpSeen === true,
        };
      },
    },
  ),
);
storage.bind(() => void useWalk.persist.rehydrate());

/** Is the camera in (or flying into) first person? What the walls, the roof and the storeys read. */
export const useWalking = (): boolean => useWalk((s) => s.phase === "enter" || s.phase === "walk");
/** Is any walk in progress, flights included? What the HUD, the canvas and the declutter layer read. */
export const useWalkActive = (): boolean => useWalk((s) => s.phase !== "off");

/** Start a walk from a room (a chip, the palette) or the front door. */
export const walkHere = (roomId?: string | null): void => useWalk.getState().begin(roomId ?? null);
