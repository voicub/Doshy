import { DropIcon, ForkKnifeIcon, GearIcon, WashingMachineIcon, WindIcon, type Icon } from "@phosphor-icons/react";
import type { WashKind } from "@/lib/washdata";

/** The icon of a WashData appliance in lists, the glance chip and the scene marker (the owner's own item icon still wins there). */
export const WASH_ICON: Record<WashKind, Icon> = { washer: WashingMachineIcon, dryer: WindIcon, dishwasher: ForkKnifeIcon, pump: DropIcon, other: GearIcon };
