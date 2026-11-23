"use client";
import { useRef } from "react";
import type { Group } from "three";
import CameraPresets from "./CameraPresets";
import Controller from "./Controller";
import Ghost from "./Ghost";
import Gizmos from "./Gizmos";
import Highlights from "./Highlights";
import PaintPicker from "./PaintPicker";
import Proxies from "./Proxies";
import SelectionScreen from "./SelectionScreen";
import ViewInset from "./ViewInset";
import { useStore } from "@/lib/store";
import useForceCutaway from "./useForceCutaway";
import useFurnitureKeys from "./useFurnitureKeys";
import "./edit.css";

/**
 * FURNITURE view, inside the Canvas: pick furniture by clicking it, drag it across the floor with the wall / solid-item collision of the plan editor,
 * rotate it with the ring or the keys, lift it with the arrow gizmo, place catalog items with a ghost that follows the cursor. Walls, rooms and openings are not pickable here.
 */
export default function FurnitureEditor3D() {
  const proxies = useRef<Group>(null);
  const painting = useStore((s) => s.tool === "paint"); // the paint bucket replaces dragging: clicks paint instead of selecting and moving
  useForceCutaway();
  useFurnitureKeys();
  return (
    <>
      <Proxies group={proxies} all={false} />
      <Gizmos />
      <SelectionScreen />
      <Highlights furniture />
      <Ghost />
      <CameraPresets />
      <ViewInset />
      {painting ? <PaintPicker /> : <Controller mode="furniture" proxies={proxies} />}
    </>
  );
}
