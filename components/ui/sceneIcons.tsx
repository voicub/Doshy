import { BroomIcon, ConfettiIcon, FanIcon, FilmSlateIcon, ForkKnifeIcon, LightbulbIcon, MoonStarsIcon, PlugsIcon, RowsIcon, SunHorizonIcon, TelevisionIcon, ThermometerIcon, UsersIcon, DoorOpenIcon, SparkleIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import type { DeviceKind } from "@/lib/sceneDevices";
import type { SceneIcon } from "@/lib/scenes";

/** The picture of each scene template. */
export const SCENE_ICON: Record<SceneIcon, ReactNode> = {
  movie: <FilmSlateIcon size={20} />,
  morning: <SunHorizonIcon size={20} />,
  away: <DoorOpenIcon size={20} />,
  bed: <MoonStarsIcon size={20} />,
  dinner: <ForkKnifeIcon size={20} />,
  clean: <BroomIcon size={20} />,
  party: <ConfettiIcon size={20} />,
  guests: <UsersIcon size={20} />,
  custom: <SparkleIcon size={20} />,
};

/** The picture of each kind of device. */
export const KIND_ICON: Record<DeviceKind, ReactNode> = {
  light: <LightbulbIcon size={16} />,
  cover: <RowsIcon size={16} />,
  media: <TelevisionIcon size={16} />,
  climate: <ThermometerIcon size={16} />,
  fan: <FanIcon size={16} />,
  switch: <PlugsIcon size={16} />,
};
