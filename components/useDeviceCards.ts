import { useCallback, useEffect, useState } from "react";
import { domainOf } from "@/lib/ha";
import { isTvEntity } from "@/lib/plex";
import { useStore } from "@/lib/store";
import { useMediaUi } from "./ui/mediaUi";
import { CURTAIN_EVENT, DEVICE_EVENT, curtainTarget, deviceTarget, type CurtainTarget, type DeviceTarget } from "./ui/serviceActions";

/** A card target; `n` re-keys the card so opening it again starts it fresh. */
type Card<T> = (T & { n: number }) | null;

export type DeviceCards = {
  /** The device popover, the live camera picture (CameraCard) and the two-layer curtain card: at most one of each. */
  device: Card<DeviceTarget>;
  camera: Card<DeviceTarget>;
  curtain: Card<CurtainTarget>;
  openDevice: (t: DeviceTarget) => void;
  closeDevice: () => void;
  closeCamera: () => void;
  closeCurtain: () => void;
  /** Close all three. */
  closeAll: () => void;
};

/**
 * The device cards: a click on a linked device in the scene (`housey:device`) opens the right one (camera, thermostat, TV, player or the plain device card),
 * a tap on a window curtain with a cover (`housey:curtain`) opens the curtain card.
 */
export function useDeviceCards(openClimate: (entity: string) => void, openPlex: () => void): DeviceCards {
  const [device, setDevice] = useState<Card<DeviceTarget>>(null);
  const [camera, setCamera] = useState<Card<DeviceTarget>>(null);
  const [curtain, setCurtain] = useState<Card<CurtainTarget>>(null);

  const openDevice = useCallback((t: DeviceTarget) => {
    if (domainOf(t.entity) === "camera") { setDevice(null); setCamera((c) => ({ ...t, n: (c?.n ?? 0) + 1 })); }
    else if (domainOf(t.entity) === "climate") { setDevice(null); openClimate(t.entity); }
    else if (isTvEntity(useStore.getState().states, t.entity)) { setDevice(null); openPlex(); }
    else if (domainOf(t.entity) === "media_player") { setDevice(null); useMediaUi.getState().show(t.entity); }
    else setDevice((d) => ({ ...t, n: (d?.n ?? 0) + 1 }));
  }, [openClimate, openPlex]);

  useEffect(() => {
    const on = (e: Event) => { const t = deviceTarget(e); if (t) openDevice(t); };
    window.addEventListener(DEVICE_EVENT, on);
    return () => window.removeEventListener(DEVICE_EVENT, on);
  }, [openDevice]);
  useEffect(() => {
    const on = (e: Event) => {
      const t = curtainTarget(e);
      if (!t) return;
      setDevice(null);
      setCurtain((c) => ({ ...t, n: (c?.n ?? 0) + 1 }));
    };
    window.addEventListener(CURTAIN_EVENT, on);
    return () => window.removeEventListener(CURTAIN_EVENT, on);
  }, []);

  const closeDevice = useCallback(() => setDevice(null), []);
  const closeCamera = useCallback(() => setCamera(null), []);
  const closeCurtain = useCallback(() => setCurtain(null), []);
  const closeAll = useCallback(() => { setDevice(null); setCamera(null); setCurtain(null); }, []);
  return { device, camera, curtain, openDevice, closeDevice, closeCamera, closeCurtain, closeAll };
}
