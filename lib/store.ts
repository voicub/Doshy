import { create } from "zustand";
import { persist } from "zustand/middleware";
import { CATALOG } from "./catalog";
import { OPENING_DEFAULTS, WALL_H, normalizeOpening, wallLen, withOpeningDims } from "./geometry";
import { fenceDefaults, isFence, wallHeight } from "./fences";
import { fetchStates, toggleEntity, type HAState } from "./ha";
import { currentHome, homeKnown, onHomeChange } from "./haHome";
import { mergeStates } from "./statesMerge";
import { isReplaying, rememberPoll } from "./replayGate";
import { onGuestPage } from "./guestMode";
import { singleFlight } from "./singleFlight";
import { createChangeOnlyStorage } from "./persistStable";
import { FLOOR_COLORS } from "./palette";
import { beginEdit, commitPlan, endEdit, keepSel, redoStep, undoStep } from "./history";
import { addLevelTo, createRoomWalls, moveRoomWithContents, removeLevelFrom, resizeRoom, resizeWall, setBuildingTypeIn, setEntryIn, setRoofIn, updateLevelIn, withDefaultLevels, type NewLevel } from "./planOps";
import { addFlowTo, dropOrphanFlows, patchFlowIn, removeFlowFrom } from "./flows";
import { applyAdditions } from "./additions";
import { STARTER_VERSION, starterPlan } from "./starterPlan";
import { errorMessage } from "./guards";
import { dbStorage } from "./dbClient";
import { findLevel, GROUND_ID, levelIdOf, levelsOf, onLevel } from "./levels";
import { viewPicksItem } from "./pillars";
import { ROOF_DEFAULTS, normalizeRoof, roofOf } from "./roof";
import type { BuildingEntry, BuildingType, Flow, GlassTint, GroundArea, GroundPath, Item, Level, Opening, OpeningStyle, OpeningType, Plan, Roof, Room, Sel, SelType, SlabVoid, Wall, WallStyle } from "./types";
import { addGroundTo, addPathTo, type NewArea, type NewPath } from "./ground";
import { uid } from "./uid";
import { setSiteIn, withSite, type SitePatch } from "./siteUi";
import { withScenes } from "./scenes";
import { withChoreographies } from "./arrival";
import { withMdiIcons } from "./mdiPlan";
import { withDesign } from "./designFields";
import { placedHeight } from "./voids";
import { addLine, patchLine, removeLine, type UtilityLine } from "./utilities";


const KEY = { wall: "walls", opening: "openings", room: "rooms", item: "items", void: "voids", ground: "ground", path: "paths" } as const;

export type Tool = "select" | "wall" | "room" | "door" | "window" | "pillar" | "paint" | "stairwell" | "garden" | "lines" | "pipes" | "ruler" | "annotate" | `add:${string}`;
/** live: the 3D scene. plan: walls, rooms, doors, windows. furniture: placing and shaping furniture. ha: linking things to Home Assistant. */
export type View = "live" | "plan" | "furniture" | "ha";
export const VIEWS: readonly View[] = ["live", "plan", "furniture", "ha"];
/** What can be selected in each view (live selects nothing). */
const SEL_VIEWS: Record<View, readonly SelType[]> = { live: [], plan: ["wall", "room", "opening", "void", "item", "ground", "path"], furniture: ["item"], ha: ["item", "room", "opening"] }; // plan: items only when they are pillars (see `viewPicksItem`)
/** Tools each view honours. */
const viewAllowsTool = (view: View, tool: Tool): boolean =>
  tool === "select" || (view === "plan" ? ["wall", "room", "door", "window", "pillar", "paint", "stairwell", "garden", "lines", "pipes", "ruler", "annotate"].includes(tool) : view === "furniture" ? tool.startsWith("add:") || tool === "paint" : false);
type LevelView = "all" | "upTo" | "only";
const LEVEL_VIEWS: readonly LevelView[] = ["all", "upTo", "only"];
/** The level the editors work on: the stored one, or the first level when it no longer exists. */
export const activeLevelId = (s: { plan: Plan; activeLevel: string }): string => findLevel(s.plan, s.activeLevel).id;
export type TimeOfDay = "day" | "dusk" | "night";
export type Environment = "studio" | "garden";

/** What the next door / window placed looks like: size plus optional style, frame colour and glass tint (all copied onto the new opening). */
export type OpeningSize = { width: number; height: number; sill: number; style?: OpeningStyle; color?: string; tint?: GlassTint };
export { FLOOR_COLORS } from "./palette";
export { uid } from "./uid";
export { starterPlan } from "./starterPlan";

type State = {
  plan: Plan;
  sel: Sel;
  tool: Tool;
  view: View;
  cutaway: boolean;
  time: TimeOfDay;
  environment: Environment;
  focusRoom: string | null;
  /** Room mode (live view only, not persisted): the room the scene is isolated on. Builds on `focusRoom`, which it keeps equal. */
  isolatedRoom: string | null;
  /** Room mode: isolate the whole open-plan space the room belongs to (default on; only meaningful when the room has one). */
  isolateOpen: boolean;
  cinema: boolean;
  states: Record<string, HAState>;
  haError: string | null;
  setTool: (t: Tool) => void;
  setView: (v: View) => void;
  setCutaway: (c: boolean) => void;
  setTime: (t: TimeOfDay) => void;
  setEnvironment: (e: Environment) => void;
  setFocusRoom: (roomId: string | null) => void; // Scene3D animates the camera to the room, null = back to overview (and out of Room mode)
  setIsolatedRoom: (roomId: string | null) => void; // Room mode: the scene isolates this room (and focuses it); null = back to the house, the camera stays on the focused room
  setIsolateOpen: (on: boolean) => void; // Room mode: bring the open-plan space (hall + living room + kitchen) along
  setCinema: (on: boolean) => void; // hides HUD, letterbox bars, slow camera drift
  /** Compass bearing (degrees clockwise from north) of the plan's up direction; drives the real sun direction and the compass HUD. */
  setBearing: (deg: number) => void;
  /** Change where the plan stands and which real surroundings are drawn (lib/siteTypes.ts). One undo step; inside a gesture (a drag) it joins that gesture. */
  setSite: (patch: SitePatch) => void;
  select: (s: Sel) => void;
  /** Draw a wall; `style` defaults to plaster. A fence style (lib/fences.ts) also sets the wall's height and thickness. */
  addWall: (a: Wall["a"], b: Wall["b"], style?: WallStyle) => void;
  /** Add a room rectangle. With `parent` it extends that room instead (an L, T or U shaped room is rectangles joined under one host). */
  addRoom: (r: Pick<Room, "x" | "y" | "w" | "h"> & Partial<Pick<Room, "parent">>) => void;
  /** Cut a hole in the active level's floor (a stairwell, seen from below as an opening in the ceiling) and select it. */
  addVoid: (r: Pick<SlabVoid, "x" | "y" | "w" | "h">) => void;
  /** Lay a patch of ground (patio, lawn, drive, pond ...) and select it. Ground is not a room and lies on the ground whatever level is shown. Returns its id. */
  addGround: (a: NewArea) => string;
  /** Lay a path (garden path, drive ...) and select it. Returns its id, or null when it has fewer than two distinct points. */
  addPath: (p: NewPath) => string | null;
  addOpening: (o: Omit<Opening, "id">) => void;
  addItem: (kind: string, x: number, y: number) => void;
  addUtility: (line: UtilityLine) => void;
  patchUtility: (id: string, patch: Partial<Omit<UtilityLine, "id">>) => void;
  removeUtility: (id: string) => void;
  patch: (type: SelType, id: string, p: Partial<Wall> | Partial<Opening> | Partial<Room> | Partial<Item> | Partial<SlabVoid> | Partial<GroundArea> | Partial<GroundPath>) => void; // a union, not an intersection: Wall.style and Opening.style are disjoint literal types and would collapse an intersection to never
  remove: (type: SelType, id: string) => void;
  setPlan: (p: Plan) => void;
  refreshStates: () => Promise<void>;
  toggle: (entityId: string) => Promise<void>;
  toggleMany: (entityIds: string[]) => Promise<void>;
  /** Size used for the next door / window placed (metres). `sill` = height of the opening's bottom edge above the floor. */
  openingDefaults: Record<OpeningType, OpeningSize>;
  setOpeningDefaults: (type: OpeningType, p: Partial<OpeningSize>) => void;
  /** Move a room; with contents (default) its walls, doors, windows, alcoves and furniture move with it. */
  moveRoom: (roomId: string, dx: number, dy: number, withContents?: boolean) => void;
  /** Change a room's inside dimensions by moving its east/south walls. */
  resizeRoomTo: (roomId: string, w: number, h: number) => void;
  /** Add the four walls around a room's rectangle (only where a wall is missing). */
  createRoomWalls: (roomId: string) => void;
  /** Change a wall's length by moving its b end along the wall direction; its doors and windows keep their distance from the a end. */
  resizeWallTo: (wallId: string, len: number) => void;
  /** Start a pointer drag / draw / placement: one undo step for everything until `endEdit`. Patches, moves and adds made in between add no steps. */
  beginEdit: () => void;
  endEdit: () => void;
  undo: () => void;
  redo: () => void;
  /** Undo history (not persisted), newest last, capped at 60 steps. */
  past: Plan[];
  future: Plan[];
  /** True between `beginEdit` and `endEdit`. */
  gesture: boolean;
  /** The level the plan and furniture editors work on (new walls, rooms, openings and items land here). Persisted; a stale id falls back to the first level (`activeLevelId`). */
  activeLevel: string;
  setActiveLevel: (id: string) => void;
  /** Which levels the 3D scene and the 2D editor show: every one, the active one and all below it, or just the active one. Persisted. */
  levelView: LevelView;
  setLevelView: (v: LevelView) => void;
  /** Add a level (default on top of the highest, named "Level N"); with `copyFrom` it starts as a copy of that level. Returns the new id and makes it active. */
  addLevel: (opts?: NewLevel) => string;
  /** Remove a level and everything on it. The last level stays. */
  removeLevel: (id: string) => void;
  updateLevel: (id: string, p: Partial<Pick<Level, "name" | "elevation" | "height">>) => void;
  setBuildingType: (type: BuildingType) => void;
  /** How the front door is reached: the building's shared hallway, steps or stairs from outside, or just a door. One undo step. */
  setEntry: (entry: BuildingEntry) => void;
  /** Replace the plan with `fn(plan)` as one undo step (inside a gesture, joins it); the same plan back is a no-op. The paint bucket and the whole-room / outside-walls buttons use it. */
  editPlan: (fn: (plan: Plan) => Plan) => void;
  /** Change the house roof's type, pitch or overhang (clamped; absent fields keep their value or the default). */
  setRoof: (patch: Partial<Roof>) => void;
  /** Flows (live power lines between two items): add one (returns its id, null when the items are not valid), edit it, remove it. Each is one undo step. */
  addFlow: (f: Omit<Flow, "id">) => string | null;
  patchFlow: (id: string, p: Partial<Omit<Flow, "id">>) => void;
  removeFlow: (id: string) => void;
};

/** Clamp an opening to its wall (inside it, below the ceiling, not smaller than the minimum). */
function fitOpening(plan: Plan, o: Opening): Opening {
  const wall = plan.walls.find((w) => w.id === o.wallId);
  return wall ? normalizeOpening(o, wallLen(wall), wallHeight(wall, WALL_H)) : o;
}

/** What a plan is made of, ignoring the random ids: two plans with the same signature are the same drawing. Used to tell the untouched starter flat from a plan someone worked on. */
const drawing = (p: Plan | undefined) => JSON.stringify([p?.items?.map((i) => `${i.kind}@${i.x},${i.y},${i.rot}`).sort(), p?.walls?.map((w) => `${w.a.x},${w.a.y},${w.b.x},${w.b.y}`).sort(), p?.rooms?.length]);
const isStarterPlan = (p: unknown) => drawing(p as Plan) === drawing(starterPlan()); // `p` is a plan out of storage or from the server, checked by its shape only here
const storage = dbStorage("housey-plan", "plan", STARTER_VERSION, isStarterPlan);

/** When the last states poll succeeded. `states` keeps its identity while Home Assistant reports nothing new, so readers that need every poll (power history, run detection) listen here instead. */
export const usePoll = create<{ at: number }>(() => ({ at: 0 }));
let lastList: HAState[] | null = null; // the array the previous poll returned (the same one again means "unchanged")
let lastMerged: Record<string, HAState> | null = null; // the map that poll produced

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      plan: withDefaultLevels(starterPlan()),
      activeLevel: GROUND_ID,
      levelView: "all",
      past: [],
      future: [],
      gesture: false,
      sel: null,
      tool: "select",
      view: "live",
      cutaway: true,
      time: "dusk",
      environment: "studio",
      focusRoom: null,
      isolatedRoom: null,
      isolateOpen: true,
      cinema: false,
      states: {},
      haError: null,
      openingDefaults: { door: { ...OPENING_DEFAULTS.door }, window: { ...OPENING_DEFAULTS.window } },
      setTool: (tool) => set((s) => (viewAllowsTool(s.view, tool) ? { tool, sel: null } : {})),
      setView: (view) => set({ view, tool: "select", sel: null, isolatedRoom: null }),
      setCutaway: (cutaway) => set({ cutaway }),
      setTime: (time) => set({ time }),
      setEnvironment: (environment) => set({ environment }),
      setFocusRoom: (focusRoom) => set((s) => ({ focusRoom, isolatedRoom: focusRoom && s.isolatedRoom ? focusRoom : null })), // Room mode follows the focus; releasing the focus leaves it
      setIsolatedRoom: (isolatedRoom) => set(isolatedRoom ? { isolatedRoom, focusRoom: isolatedRoom } : { isolatedRoom: null }),
      setIsolateOpen: (isolateOpen) => set({ isolateOpen }),
      setCinema: (cinema) => set({ cinema }),
      setBearing: (deg) => set((s) => commitPlan(s, { ...s.plan, bearing: ((Math.round(deg) % 360) + 360) % 360 })),
      setSite: (patch) => set((s) => setSiteIn(s, patch)),
      select: (sel) =>
        set((s) => {
          if (!sel) return { sel };
          if (!SEL_VIEWS[s.view].includes(sel.type)) return {};
          // plan and furniture edit one level at a time; Home Assistant linking may reach any level
          if ((s.view === "plan" || s.view === "furniture") && sel.type !== "ground" && sel.type !== "path") { // ground lies under every level
            const rows: readonly { id: string; level?: string; kind?: string }[] = s.plan[KEY[sel.type]] ?? [];
            const e = rows.find((o) => o.id === sel.id);
            if (!e || levelIdOf(s.plan, e) !== activeLevelId(s)) return {};
          }
          if (sel.type === "item") {
            // pillars are edited in Plan mode, every other item in Furniture mode and Home Assistant mode
            const it = s.plan.items.find((o) => o.id === sel.id);
            if (!it || !viewPicksItem(s.view, it.kind)) return {};
          }
          return { sel };
        }),
      addWall: (a, b, style = "plaster") => set((s) => commitPlan(s, { ...s.plan, walls: [...s.plan.walls, { id: uid(), a, b, style, ...(isFence(style) ? fenceDefaults(style) : {}), level: activeLevelId(s) }] })),
      addRoom: (r) =>
        set((s) => {
          const host = r.parent ? s.plan.rooms.find((x) => x.id === r.parent && !x.parent) : undefined; // an extension keeps its host's name, floor and colour
          const room: Room = host
            ? { ...r, id: uid(), name: `${host.name} extension`, floor: host.floor, color: host.color, parent: host.id, level: host.level ?? activeLevelId(s) }
            : { x: r.x, y: r.y, w: r.w, h: r.h, id: uid(), name: `Room ${onLevel(s.plan, activeLevelId(s)).rooms.length + 1}`, floor: "wood", color: FLOOR_COLORS.wood, level: activeLevelId(s) };
          return commitPlan(s, { ...s.plan, rooms: [...s.plan.rooms, room] });
        }),
      addVoid: (r) => {
        const v: SlabVoid = { id: uid(), name: "Stairs opening", x: r.x, y: r.y, w: r.w, h: r.h, level: activeLevelId(get()) };
        set((s) => ({ ...commitPlan(s, { ...s.plan, voids: [...(s.plan.voids ?? []), v] }), tool: "select", sel: { type: "void", id: v.id } }));
      },
      addGround: (a) => {
        const id = uid();
        set((s) => ({ ...commitPlan(s, addGroundTo(s.plan, a, id)), tool: "select", sel: { type: "ground", id } }));
        return id;
      },
      addPath: (p) => {
        const id = uid();
        const next = addPathTo(get().plan, p, id);
        if (next === get().plan) return null;
        set((s) => ({ ...commitPlan(s, next), tool: "select", sel: { type: "path", id } }));
        return id;
      },
      addOpening: (o) =>
        set((s) => {
          const wall = s.plan.walls.find((w) => w.id === o.wallId);
          return commitPlan(s, { ...s.plan, openings: [...s.plan.openings, fitOpening(s.plan, { ...o, id: uid(), level: wall ? levelIdOf(s.plan, wall) : activeLevelId(s) })] });
        }),
      addUtility: (line) => set((s) => commitPlan(s, addLine(s.plan, line))),
      patchUtility: (id, patch) => set((s) => commitPlan(s, patchLine(s.plan, id, patch))),
      removeUtility: (id) => set((s) => commitPlan(s, removeLine(s.plan, id))),
      setOpeningDefaults: (type, p) => set((s) => ({ openingDefaults: { ...s.openingDefaults, [type]: { ...s.openingDefaults[type], ...p } } })),
      moveRoom: (roomId, dx, dy, withContents = true) =>
        set((s) =>
          commitPlan(s, withContents ? moveRoomWithContents(s.plan, roomId, dx, dy) : { ...s.plan, rooms: s.plan.rooms.map((r) => (r.id === roomId ? { ...r, x: r.x + dx, y: r.y + dy } : r)) }),
        ),
      resizeRoomTo: (roomId, w, h) => set((s) => commitPlan(s, resizeRoom(s.plan, roomId, w, h))),
      createRoomWalls: (roomId) => set((s) => commitPlan(s, createRoomWalls(s.plan, roomId))),
      resizeWallTo: (wallId, len) => set((s) => commitPlan(s, resizeWall(s.plan, wallId, len))),
      addItem: (kind, x, y) => {
        const d = CATALOG[kind];
        const item: Item = { id: uid(), kind, x, y, rot: 0, w: d.w, d: d.d, h: placedHeight(get().plan, activeLevelId(get()), kind), level: activeLevelId(get()) };
        set((s) => ({ ...commitPlan(s, { ...s.plan, items: [...s.plan.items, item] }), tool: "select", sel: viewPicksItem(s.view, kind) ? { type: "item", id: item.id } : s.sel }));
      },
      patch: (type, id, p) =>
        set((s) => {
          // an opening always stays physically valid for its wall: inside it, under the ceiling, no smaller than the minimum
          if (type === "opening") return commitPlan(s, { ...s.plan, openings: s.plan.openings.map((o) => (o.id === id ? fitOpening(s.plan, Object.assign({}, o, p)) : o)) });
          const rows: readonly { id: string }[] = s.plan[KEY[type]] ?? [];
          return commitPlan(s, { ...s.plan, [KEY[type]]: rows.map((o) => (o.id === id ? { ...o, ...p } : o)) });
        }),
      remove: (type, id) =>
        set((s) => {
          const rows: readonly { id: string }[] = s.plan[KEY[type]] ?? [];
          return {
            sel: null,
            ...commitPlan(s, dropOrphanFlows({
              ...s.plan,
              [KEY[type]]: rows.filter((o) => o.id !== id),
              // deleting a wall takes its doors/windows with it
              openings: s.plan.openings.filter((o) => (type === "wall" ? o.wallId !== id : type === "opening" ? o.id !== id : true)),
            })),
          };
        }),
      setPlan: (plan) =>
        set((s) => {
          const next = withMdiIcons(withDesign(withChoreographies(withScenes(withSite(withDefaultLevels({ ...plan, openings: plan.openings.map(withOpeningDims) }))))));
          return { ...commitPlan(s, next), sel: null, activeLevel: findLevel(next, s.activeLevel).id };
        }),
      setActiveLevel: (id) => set((s) => (levelsOf(s.plan).some((l) => l.id === id) ? { activeLevel: id, sel: null } : {})),
      setLevelView: (levelView) => set({ levelView }),
      addLevel: (opts) => {
        const { plan, id } = addLevelTo(get().plan, opts);
        set((s) => ({ ...commitPlan(s, plan), activeLevel: id, sel: null }));
        return id;
      },
      removeLevel: (id) =>
        set((s) => {
          const next = removeLevelFrom(s.plan, id);
          return next === s.plan ? {} : { ...commitPlan(s, next), sel: keepSel(s.sel, next), activeLevel: findLevel(next, s.activeLevel === id ? undefined : s.activeLevel).id };
        }),
      updateLevel: (id, p) => set((s) => commitPlan(s, updateLevelIn(s.plan, id, p))),
      setBuildingType: (type) => set((s) => commitPlan(s, setBuildingTypeIn(s.plan, type))),
      setEntry: (entry) => set((s) => commitPlan(s, setEntryIn(s.plan, entry))),
      editPlan: (fn) => set((s) => commitPlan(s, fn(s.plan))),
      setRoof: (patch) => set((s) => commitPlan(s, setRoofIn(s.plan, normalizeRoof({ ...(roofOf(s.plan) ?? ROOF_DEFAULTS), ...patch })))),
      addFlow: (f) => {
        const { plan, id } = addFlowTo(get().plan, f);
        if (id) set((s) => commitPlan(s, plan));
        return id;
      },
      patchFlow: (id, p) => set((s) => commitPlan(s, patchFlowIn(s.plan, id, p))),
      removeFlow: (id) => set((s) => commitPlan(s, removeFlowFrom(s.plan, id))),
      beginEdit: () => set((s) => beginEdit(s)),
      endEdit: () => set((s) => endEdit(s)),
      undo: () =>
        set((s) => {
          const r = undoStep(s);
          return { ...r, sel: keepSel(s.sel, r.plan ?? s.plan) };
        }),
      redo: () =>
        set((s) => {
          const r = redoStep(s);
          return { ...r, sel: keepSel(s.sel, r.plan ?? s.plan) };
        }),
      // One poll at a time: a tick that finds one still running joins it, so a slow or stuck server cannot collect a pile of open requests (fetchStates gives up on its own).
      refreshStates: singleFlight(async () => {
        await homeKnown();
        const home = currentHome(); // the answer is only for this home: another plan may have been opened while it was on its way
        const again = () => void setTimeout(() => void get().refreshStates(), 0); // after this run has ended, so it starts a new one
        try {
          const list = await fetchStates();
          if (currentHome() !== home) return again();
          if (isReplaying()) return rememberPoll(list); // history replay owns `states`: the poll waits for it to end, and feeds no live buffer
          const { states, haError } = get();
          // An unchanged poll hands back the same array. Skip it too, unless something wrote `states` meanwhile (an optimistic update the server never confirmed): then merge, which restores the server's values.
          const settled = list === lastList && states === lastMerged;
          const next = settled ? states : mergeStates(states, list);
          lastList = list;
          lastMerged = next;
          if (next !== states || haError) set({ states: next, haError: null });
          usePoll.setState({ at: Date.now() });
        } catch (e) {
          if (currentHome() !== home) return again();
          if (!isReplaying()) set({ haError: errorMessage(e) });
        }
      }),
      toggle: async (entityId) => get().toggleMany([entityId]),
      toggleMany: async (entityIds) => {
        if (isReplaying() || onGuestPage()) return; // controls are off while the history is replayed, and always on the read-only guest page
        try {
          await Promise.all(entityIds.map(toggleEntity));
          setTimeout(() => void get().refreshStates(), 400); // HA needs a moment to publish the new state
        } catch (e) {
          set({ haError: errorMessage(e) });
        }
      },
    }),
    {
      name: "housey-plan",
      version: STARTER_VERSION,
      storage: createChangeOnlyStorage(() => storage),
      partialize: (s) => ({ plan: s.plan, time: s.time, cutaway: s.cutaway, view: s.view, environment: s.environment, openingDefaults: s.openingDefaults, activeLevel: s.activeLevel, levelView: s.levelView }),
      // Runs on every load, whatever the saved version. A save from before the editing modes were split holds view "edit": that is the plan mode now.
      // Plans saved before levels existed get a building and one raised level; a stale active level falls back to the first.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<State>;
        const saved: string | undefined = p.view;
        const plan = withMdiIcons(withDesign(withChoreographies(withScenes(withSite(applyAdditions(withDefaultLevels(p.plan ?? current.plan)))))));
        return {
          ...current,
          ...p,
          plan,
          view: VIEWS.includes(saved as View) ? (saved as View) : saved === "edit" ? "plan" : "live",
          levelView: LEVEL_VIEWS.includes(p.levelView as LevelView) ? (p.levelView as LevelView) : "all",
          activeLevel: findLevel(plan, p.activeLevel).id,
          // a plan that came from the server replaces this one: the undo steps belong to the old one, and the selection may no longer exist
          past: [],
          future: [],
          gesture: false,
          sel: keepSel(current.sel, plan),
        };
      },
      // The persist version IS the starter version: when the starter flat changes, a plan saved from an older one is replaced by the new starter.
      // A plan saved at the current version is the user's own and is kept (opening dimensions filled in; building and levels preserved).
      migrate: (persisted, version) => {
        const p = (persisted ?? {}) as Partial<State>;
        if (!p.plan || version < STARTER_VERSION) return { ...p, plan: starterPlan() } as State;
        const { walls = [], openings = [], rooms = [], items = [], bearing, building, levels, voids, ground, paths, site, flows, added, scenes, choreographies, annotations, trace, maintenance, utilities } = p.plan;
        return { ...p, plan: withDesign(withChoreographies(withScenes(withSite({ walls, rooms, items, bearing, building, levels, voids, ground, paths, site, flows, added, scenes, choreographies, annotations, trace, maintenance, utilities, openings: openings.map(withOpeningDims) })))) } as State;
      },
    },
  ),
);

// Another home on screen (a plan that shows a different Home Assistant was opened): nothing of the old home may stay on screen, not its devices, its error or the "nothing changed" memory.
onHomeChange(() => {
  lastList = null;
  lastMerged = null;
  useStore.setState({ states: {}, haError: null });
  usePoll.setState({ at: 0 });
  void useStore.getState().refreshStates();
});
storage.bind(() => void useStore.persist.rehydrate());
