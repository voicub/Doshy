import {
  AlarmIcon, ArmchairIcon, BasketIcon, BathtubIcon, BatteryFullIcon, BedIcon, BellIcon, BellRingingIcon, BicycleIcon, BirdIcon, CalendarIcon, CameraIcon, CarIcon, CarSimpleIcon, CatIcon, ClockIcon, CloudIcon,
  CoffeeIcon, CookingPotIcon, CouchIcon, DeskIcon, DogIcon, DoorIcon, DoorOpenIcon, DropHalfIcon, DropIcon, EyeIcon, FanIcon, FireIcon, FishIcon, FlowerIcon, GarageIcon, GaugeIcon, GearIcon, GiftIcon, HouseIcon,
  HouseLineIcon, KeyIcon, KnifeIcon, LampIcon, LampPendantIcon, LaptopIcon, LeafIcon, LightbulbFilamentIcon, LightbulbIcon, LightningIcon, LockIcon, LockOpenIcon, MailboxIcon, MonitorIcon, MoonIcon, MusicNotesIcon,
  OvenIcon, PackageIcon, PawPrintIcon, PersonIcon, PlantIcon, PlugChargingIcon, PlugIcon, PowerIcon, PrinterIcon, RadioIcon, RobotIcon, ShieldCheckIcon, ShieldIcon, ShowerIcon, SirenIcon, SlidersIcon,
  SnowflakeIcon, SolarPanelIcon, SolarRoofIcon, SpeakerHighIcon, SunIcon, TelevisionIcon, ThermometerColdIcon, ThermometerHotIcon, ThermometerIcon, TimerIcon, ToggleRightIcon, ToiletIcon, TrashIcon, TreeIcon,
  VideoCameraIcon, WashingMachineIcon, WavesIcon, WifiHighIcon, WindIcon, WindmillIcon, WineIcon, WrenchIcon, type Icon,
} from "@phosphor-icons/react";

/** Drawing of each icon id in lib/deviceIcons.ts (an id without a drawing yields no icon, see iconComponent). */
const ICON_COMPONENTS: Record<string, Icon> = {
  lightbulb: LightbulbIcon, filament: LightbulbFilamentIcon, lamp: LampIcon, pendant: LampPendantIcon, fan: FanIcon, temperature: ThermometerIcon, hot: ThermometerHotIcon, cold: ThermometerColdIcon,
  tv: TelevisionIcon, plug: PlugIcon, charging: PlugChargingIcon, lock: LockIcon, unlocked: LockOpenIcon, door: DoorIcon, "door-open": DoorOpenIcon, garage: GarageIcon, camera: CameraIcon, video: VideoCameraIcon,
  bell: BellIcon, "alarm-bell": BellRingingIcon, siren: SirenIcon, water: DropIcon, humidity: DropHalfIcon, flame: FireIcon, snow: SnowflakeIcon, wind: WindIcon, sun: SunIcon, moon: MoonIcon, cloud: CloudIcon,
  bolt: LightningIcon, battery: BatteryFullIcon, car: CarIcon, "car-simple": CarSimpleIcon, bike: BicycleIcon, washer: WashingMachineIcon, oven: OvenIcon, toilet: ToiletIcon, bath: BathtubIcon, shower: ShowerIcon,
  bed: BedIcon, armchair: ArmchairIcon, sofa: CouchIcon, desk: DeskIcon, monitor: MonitorIcon, laptop: LaptopIcon, printer: PrinterIcon, wifi: WifiHighIcon, speaker: SpeakerHighIcon, music: MusicNotesIcon,
  radio: RadioIcon, robot: RobotIcon, plant: PlantIcon, flower: FlowerIcon, tree: TreeIcon, leaf: LeafIcon, gauge: GaugeIcon, power: PowerIcon, solar: SolarPanelIcon, "solar-roof": SolarRoofIcon, house: HouseIcon,
  "home-line": HouseLineIcon, windmill: WindmillIcon, key: KeyIcon, shield: ShieldIcon, "shield-ok": ShieldCheckIcon, eye: EyeIcon, person: PersonIcon, paw: PawPrintIcon, dog: DogIcon, cat: CatIcon, bird: BirdIcon,
  fish: FishIcon, coffee: CoffeeIcon, pot: CookingPotIcon, knife: KnifeIcon, alarm: AlarmIcon, clock: ClockIcon, timer: TimerIcon, calendar: CalendarIcon, waves: WavesIcon, sliders: SlidersIcon, switch: ToggleRightIcon,
  gear: GearIcon, wrench: WrenchIcon, package: PackageIcon, mailbox: MailboxIcon, trash: TrashIcon, basket: BasketIcon, gift: GiftIcon, wine: WineIcon,
};

/** A phosphor icon component. */
export type IconComponent = Icon;

/** The drawing for a picked icon id, or undefined when it is not one of ours. */
export const iconComponent = (id: string | undefined): IconComponent | undefined => (id ? ICON_COMPONENTS[id] : undefined);
