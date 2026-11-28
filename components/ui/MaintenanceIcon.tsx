import { BatteryLowIcon, BellIcon, CarIcon, DropIcon, FunnelIcon, LeafIcon, LightbulbIcon, SnowflakeIcon, ThermometerIcon, WavesIcon, WindIcon, WrenchIcon } from "@phosphor-icons/react";
import type { TaskIcon } from "@/lib/maintenance";
const ICONS = { battery: BatteryLowIcon, alarm: BellIcon, car: CarIcon, water: DropIcon, filter: FunnelIcon, plant: LeafIcon, bulb: LightbulbIcon, fridge: SnowflakeIcon, boiler: ThermometerIcon, kettle: ThermometerIcon, dryer: WindIcon, vacuum: WindIcon, salt: WavesIcon, gutter: WavesIcon, window: WindIcon, wrench: WrenchIcon };
export default function MaintenanceIcon({ kind }: { kind: TaskIcon }) { const Icon = ICONS[kind]; return <Icon size={20} aria-hidden />; }
