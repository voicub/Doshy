import type { Def } from "./catalog";
import { carDef, carSpec } from "./cars.ts";
import { CAR_TABLE } from "./cars.data.ts";

// One catalog kind per row of lib/cars.data.ts (kind = car_<brand>_<model>); table order is the catalog order.
export const CARS: Record<string, Def> = Object.fromEntries(
  CAR_TABLE.map((row) => {
    const spec = carSpec(row);
    return [spec.id, carDef(spec)];
  }),
);
