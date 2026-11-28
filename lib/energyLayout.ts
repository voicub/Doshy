// Where the energy flow sits in the 3D scene: the hub inside the building, each source marker on a side of it, one anchor per room, and the
// lifted arc between two points. Pure plan maths (world metres: x = plan x, z = plan y, y = up); the drawing is components/scene/EnergyFlow.tsx.
import { isCarKind } from "./cars.ts";
import type { Anchors } from "./energy.ts";
import { planBounds, type Bounds } from "./geometry.ts";
import { elevationOf, floorY, levelIdOf, sortedLevels } from "./levels.ts";
import type { V3 } from "./mathUtil.ts";
import type { Item, Plan } from "./types.ts";

type P2 = [number, number];

/** Height of the hub and of the source markers above the lowest floor. */
const HUB_H = 1.3;
/** Source markers stand this far outside the building's outline. */
const MARGIN = 1.4;
/** Room lines end this high above their floor. */
const ROOM_H = 0.35;
/** A car's marker line ends this high above its floor. */
const CAR_H = 0.9;

/** The car the charger feeds: the first car item that is linked to a Home Assistant entity (its tracker). */
export const evCar = (plan: Plan): Item | undefined => plan.items.find((i) => isCarKind(i.kind) && i.entity);

/** Where a ray from the middle of `b` along `d` leaves the outline pushed `margin` outward. */
function edgePoint(b: Bounds, d: P2, margin: number): P2 {
  const hx = (b.x1 - b.x0) / 2 + margin;
  const hy = (b.y1 - b.y0) / 2 + margin;
  const t = Math.min(Math.abs(d[0]) > 1e-9 ? hx / Math.abs(d[0]) : Infinity, Math.abs(d[1]) > 1e-9 ? hy / Math.abs(d[1]) : Infinity);
  return [(b.x0 + b.x1) / 2 + d[0] * t, (b.y0 + b.y1) / 2 + d[1] * t];
}

/**
 * The anchors of the energy flow, or null for a plan with no building. Solar sits on the north side (the compass `bearing` of the plan is
 * honoured), the grid on the south, the battery on the east, the car charger on the west or, when a linked car stands in the plan, at that car.
 * Rooms are the top-level ones (an alcove shares its parent's line) at their centre.
 */
export function energyLayout(plan: Plan): Anchors | null {
  const b = planBounds(plan);
  if (!b) return null;
  const y = (sortedLevels(plan)[0]?.elevation ?? 0) + HUB_H;
  const rad = ((plan.bearing ?? 0) * Math.PI) / 180;
  const north: P2 = [-Math.sin(rad), -Math.cos(rad)];
  const east: P2 = [-north[1], north[0]]; // clockwise on the plan
  const at = (d: P2): V3 => {
    const [x, z] = edgePoint(b, d, MARGIN);
    return [x, y, z];
  };
  const car = evCar(plan);
  return {
    hub: [(b.x0 + b.x1) / 2, y, (b.y0 + b.y1) / 2],
    sources: {
      solar: at(north),
      grid: at([-north[0], -north[1]]),
      battery: at(east),
      ev: car ? [car.x, floorY(plan, car) + (car.elev ?? 0) + CAR_H, car.y] : at([-east[0], -east[1]]),
    },
    rooms: plan.rooms.filter((r) => !r.parent).map((r) => ({ id: r.id, at: [r.x + r.w / 2, elevationOf(plan, levelIdOf(plan, r)) + ROOM_H, r.y + r.h / 2] })),
  };
}

/** A curve from `a` to `b` that rises above the straight line (a quadratic Bezier lifted by a fifth of the length, at most 1.6 m): lines stay readable where they cross. */
export function arcPoints(a: V3, b: V3, steps = 16): V3[] {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const lift = Math.min(1.6, 0.2 * len + 0.1);
  const c: V3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + lift, (a[2] + b[2]) / 2];
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    const u = 1 - t;
    return [0, 1, 2].map((k) => u * u * a[k] + 2 * u * t * c[k] + t * t * b[k]) as V3;
  });
}
