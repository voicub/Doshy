// The one line of help over the canvas on compact screens (no mouse, no keyboard): what a finger does right now. Pure; the node test runner loads this file directly.

type EditView = "plan" | "furniture" | "ha";
type HintContext = {
  view: EditView;
  /** The store's tool name: "select", "wall", "add:<kind>", ... */
  tool: string;
  /** Label of the piece being placed (tool "add:..."), if any. */
  placingLabel?: string;
  selected: boolean;
  /** A drag in progress in the furniture view. */
  gesture?: "move" | "rotate" | "elev" | null;
  /** Home Assistant mode: the Connect energy tool is on. */
  connect?: boolean;
  /** "Pick through" is on. */
  passThrough?: boolean;
};

const PLAN: Record<string, string> = {
  select: "Tap to select. Drag a wall or door to move it. Drag the floor to look around.",
  wall: "Tap to start a wall, tap again to carry on. Press Done to finish.",
  room: "Drag a rectangle to paint a floor area.",
  door: "Tap a wall to put a door there.",
  window: "Tap a wall to put a window there.",
  pillar: "Pick a shape, then tap where the pillar stands.",
  paint: "Pick a material and colour, then tap walls and rooms.",
  stairwell: "Drag a rectangle where the stairs go up through the floor.",
  garden: "Pick a surface, then drag an area or tap along a path. Press Done to finish.",
};

/** One short sentence for the current tool, selection and gesture. */
export function touchHint(c: HintContext): string {
  if (c.view === "plan") return PLAN[c.tool] ?? PLAN.select;
  if (c.view === "ha") {
    if (c.connect) return "Tap where the power comes from, then where it goes.";
    return c.selected ? "Link it in the panel." : "Tap a piece, a room floor, a door or a window to link it.";
  }
  if (c.tool === "paint") return "Tap furniture, a wall or a floor to paint it.";
  if (c.tool.startsWith("add:")) return `Tap where the ${c.placingLabel ?? "piece"} should go, then press Place.`;
  if (c.gesture === "move") return "Drop it where it should stand.";
  if (c.gesture === "rotate") return "Turn it, then let go.";
  if (c.gesture === "elev") return "Lift it, then let go.";
  if (c.passThrough) return "Pick through is on: a tap selects what is behind the top piece.";
  return c.selected ? "Drag to move. The ring turns it, the arrow lifts it." : "Tap a piece to select it. Drag the empty floor to look around.";
}
