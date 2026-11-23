import { DropIcon, FanIcon, LightbulbFilamentIcon, PlugIcon, TelevisionIcon, ThermometerIcon, type Icon } from "@phosphor-icons/react";

/** The marker icon a linked device gets when the owner has not picked one (components/scene/ItemMesh.tsx draws it, the Icon picker previews it). */
const DOMAIN_ICON: Record<string, Icon> = {
  light: LightbulbFilamentIcon,
  switch: PlugIcon,
  input_boolean: PlugIcon,
  media_player: TelevisionIcon,
  fan: FanIcon,
  humidifier: DropIcon,
  climate: ThermometerIcon,
  water_heater: ThermometerIcon,
};

export const domainIcon = (domain: string | undefined): Icon => (domain && DOMAIN_ICON[domain]) || PlugIcon;
