import type { ThreeEvent } from "@react-three/fiber";
import type { Item } from "@/lib/types";
import { openDevice, type DeviceGesture } from "./itemGesture";
import type { ItemLive } from "./useItemLive";

/** The pointer handlers of an item's root group (live view only: the editing views never toggle devices). */
type ItemPointerProps = {
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
  onContextMenu?: (e: ThreeEvent<MouseEvent>) => void;
  onPointerDown?: (e: ThreeEvent<PointerEvent>) => void;
  onPointerUp?: () => void;
  onPointerOver?: () => void;
  onPointerOut?: () => void;
};

type PointerIn = {
  item: Item;
  domain: string | undefined;
  lv: ItemLive;
  gesture: DeviceGesture;
  canToggle: boolean;
  curtainCard: boolean;
  openCurtain: (x: number, y: number) => void;
  toggle: (entity: string) => unknown;
};

/** Click toggles (or opens the device / curtain card), right-click and long press open the card, hover shows the pointer cursor. */
export function itemPointerProps(p: PointerIn): ItemPointerProps {
  const { item, domain, lv, gesture, canToggle, curtainCard } = p;
  const opensCard = domain === "camera" || !!lv.wash;
  return {
    onClick: (e) => {
      if (!item.entity && !curtainCard) return;
      const n = e.nativeEvent;
      const plain = gesture.tap(n.shiftKey, n.clientX, n.clientY);
      if (curtainCard && plain) {
        e.stopPropagation();
        p.openCurtain(n.clientX, n.clientY); // a curtain with a cover opens its card: each layer has its own buttons
        return;
      }
      if (!item.entity) return;
      if (opensCard && plain) {
        e.stopPropagation();
        openDevice(item.entity, n.clientX, n.clientY); // a camera opens its picture instead of toggling
        return;
      }
      if (!canToggle && plain) return;
      e.stopPropagation();
      if (plain) void p.toggle(item.entity);
    },
    onContextMenu: (e) => {
      if (!item.entity) return;
      e.stopPropagation();
      e.nativeEvent.preventDefault();
      gesture.menu(e.nativeEvent.clientX, e.nativeEvent.clientY);
    },
    onPointerDown: (e) => gesture.start(e.nativeEvent.clientX, e.nativeEvent.clientY),
    onPointerUp: gesture.cancel,
    onPointerOver: () => (canToggle || curtainCard || opensCard) && (document.body.style.cursor = "pointer"),
    onPointerOut: () => {
      gesture.cancel();
      document.body.style.cursor = "";
    },
  };
}
