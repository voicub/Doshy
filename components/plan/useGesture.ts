import { useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { useStore } from "@/lib/store";
import type { View } from "@/lib/planView";
import type { Pt } from "@/lib/types";
import type { Drag } from "./dragMove";
import { groundSettle } from "./groundTool";
import type { Ptr } from "./planPoint";

type Setter<T> = Dispatch<SetStateAction<T>>;
type Ref<T> = MutableRefObject<T>;

/** Everything one pointer gesture on the plan canvas keeps: what is being drawn or dragged, where the pointer is, and the undo step that wraps it. */
export type Gesture = {
  cur: Pt; setCur: Setter<Pt>;
  ptr: Ptr | null; setPtr: Setter<Ptr | null>;
  wallStart: Pt | null; setWallStart: Setter<Pt | null>;
  roomStart: Pt | null; setRoomStart: Setter<Pt | null>;
  voidStart: Pt | null; setVoidStart: Setter<Pt | null>;
  drag: Drag | null; setDrag: Setter<Drag | null>;
  /** How far the dragged thing has moved from where it started. */
  delta: Pt | null; setDelta: Setter<Pt | null>;
  hover: boolean; setHover: Setter<boolean>;
  /** Space is held: the primary button pans. */
  space: boolean; setSpace: Setter<boolean>;
  panning: boolean; setPanning: Setter<boolean>;
  /** The view pan in progress. `pick`: a finger that went down on a room's floor selects it if it does not move. */
  pan: Ref<{ x: number; y: number; v: View; pick?: string } | null>;
  editing: Ref<boolean>;
  /** Where the dragged room's pointer was when the room was last moved, and the total it moved. */
  roomLast: Ref<Pt>;
  roomTotal: Ref<Pt>;
  /** "Drag the map": where the pointer started (plan metres) and the map's offset at that moment. */
  alignDrag: Ref<{ from: Pt; dx: number; dy: number } | null>;
  /** A finger that has not lifted yet: wall, door, window, pillar and path points land when it does, so a second finger can cancel them. */
  tap: Ref<number | null>;
  wallStartRef: Ref<Pt | null>;
  begin: () => void;
  end: () => void;
  /** End whatever is in progress: drag, drawn shapes, pan, and the undo step. */
  finish: () => void;
};

export function useGesture(): Gesture {
  const [cur, setCur] = useState<Pt>({ x: 0, y: 0 });
  const [ptr, setPtr] = useState<Ptr | null>(null);
  const [wallStart, setWallStart] = useState<Pt | null>(null);
  const [roomStart, setRoomStart] = useState<Pt | null>(null);
  const [voidStart, setVoidStart] = useState<Pt | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [delta, setDelta] = useState<Pt | null>(null); // how far the dragged thing has moved from where it started
  const [hover, setHover] = useState(false);
  const [space, setSpace] = useState(false);
  const [panning, setPanning] = useState(false);
  const pan = useRef<{ x: number; y: number; v: View; pick?: string } | null>(null); // `pick`: a finger that went down on a room's floor selects it if it does not move
  const editing = useRef(false);
  const roomLast = useRef<Pt>({ x: 0, y: 0 }); // where the dragged room's pointer was when the room was last moved
  const roomTotal = useRef<Pt>({ x: 0, y: 0 });
  const alignDrag = useRef<{ from: Pt; dx: number; dy: number } | null>(null); // "Drag the map": where the pointer started (plan metres) and the map's offset at that moment
  const tap = useRef<number | null>(null); // a finger that has not lifted yet: wall, door, window, pillar and path points land when it does, so a second finger can cancel them
  const wallStartRef = useRef<Pt | null>(null);
  wallStartRef.current = wallStart;

  // One undo step per gesture: the store records the plan once between beginEdit and endEdit.
  const begin = () => {
    if (editing.current) return;
    editing.current = true;
    useStore.getState().beginEdit();
  };
  const end = () => {
    if (!editing.current) return;
    editing.current = false;
    useStore.getState().endEdit();
  };
  const finish = () => {
    setDrag(null);
    setDelta(null);
    setRoomStart(null);
    groundSettle();
    setVoidStart(null);
    setPanning(false);
    pan.current = null;
    tap.current = null;
    alignDrag.current = null;
    end();
  };

  return { cur, setCur, ptr, setPtr, wallStart, setWallStart, roomStart, setRoomStart, voidStart, setVoidStart, drag, setDrag, delta, setDelta, hover, setHover, space, setSpace, panning, setPanning, pan, editing, roomLast, roomTotal, alignDrag, tap, wallStartRef, begin, end, finish };
}
