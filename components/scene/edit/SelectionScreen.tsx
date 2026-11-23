"use client";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { Vector3 } from "three";
import { useStore } from "@/lib/store";
import { boxOf } from "./Outlines";
import { useEditUi } from "./editStore";

const v = new Vector3();

/** Where the selected piece is on screen, floor footprint to top (px inside the canvas box), written to the edit store whenever it moves by a pixel: the quick toolbar hangs off it. */
export default function SelectionScreen() {
  const sel = useStore((s) => s.sel);
  const plan = useStore((s) => s.plan);
  const box = useMemo(() => (sel?.type === "item" ? boxOf(plan, sel) : null), [plan, sel]);
  useEffect(() => () => useEditUi.getState().set({ selRect: null }), []);
  useFrame(({ camera, size }) => {
    const ui = useEditUi.getState();
    if (!box) {
      if (ui.selRect) ui.set({ selRect: null });
      return;
    }
    const a = (-box.rot * Math.PI) / 180;
    const c = Math.cos(a);
    const s = Math.sin(a);
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (let i = 0; i < 8; i++) {
      const lx = (i & 1 ? 0.5 : -0.5) * box.w;
      const lz = (i & 2 ? 0.5 : -0.5) * box.d;
      // down to the floor: the ring, plate and tags of a lifted piece lie there
      v.set(box.x + lx * c + lz * s, i & 4 ? box.y1 : box.lv, box.z - lx * s + lz * c).project(camera);
      const px = (v.x * 0.5 + 0.5) * size.width;
      const py = (-v.y * 0.5 + 0.5) * size.height;
      x0 = Math.min(x0, px);
      x1 = Math.max(x1, px);
      y0 = Math.min(y0, py);
      y1 = Math.max(y1, py);
    }
    const r = ui.selRect;
    const [a0, b0, a1, b1] = [Math.round(x0), Math.round(y0), Math.round(x1), Math.round(y1)];
    if (!r || r.x0 !== a0 || r.y0 !== b0 || r.x1 !== a1 || r.y1 !== b1) ui.set({ selRect: { x0: a0, y0: b0, x1: a1, y1: b1 } });
  });
  return null;
}
