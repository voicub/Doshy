import { Color, Vector3 } from "three";
import { makeLook } from "./Look";

/**
 * The sky as the renderer sees it this frame: a mutable singleton written once per frame by SkyDriver
 * and read imperatively (useFrame) by lights, post-processing, shafts, dust, clouds and weather.
 * Nothing here is React state, so a changing sky never re-renders the scene.
 */
export const live = {
  /** damped 0 night .. 1 day */
  daylight: 0,
  /** unit vector from the flat towards the light (sun, moon at night); x east, y up, -z north */
  sunDir: new Vector3(0.4, 0.8, 0.3).normalize(),
  /** blended look with cloud, fog and lightning already applied */
  look: makeLook(),
  cloud: 0,
  rain: 0, // 0..1 streak density
  pour: 0, // 0..1 how hard (streak length / speed)
  snow: 0,
  fog: 0,
  wet: 0, // ground wetness
  snowCover: 0,
  flash: 0, // lightning 0..1
  wind: 0, // m/s
  /** 0..1 slow gust factor (see gustAt in lib/wind.ts): strong gusts only when it is windy */
  gust: 0,
  /** advances with the wind speed, so sway speeds up and slows down without ever jumping */
  windPhase: 0,
  /** unit horizontal direction the wind blows TOWARDS (x east, z south) */
  windX: 1,
  windZ: 0,
  fogColor: new Color("#0c1016"),
  rainColor: new Color("#8ea3c4"),
};
