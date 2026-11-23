"use client";
import { useRef } from "react";
import type { Group } from "three";
import CameraPresets from "./CameraPresets";
import Controller from "./Controller";
import HaMarkers from "./HaMarkers";
import Highlights from "./Highlights";
import Proxies from "./Proxies";
import SelectionScreen from "./SelectionScreen";
import ViewInset from "./ViewInset";
import useForceCutaway from "./useForceCutaway";
import "./edit.css";

/** HOME ASSISTANT view, inside the Canvas: click an item, a room floor or an opening to select it for linking. Nothing can be moved here. */
export default function SelectionPicker() {
  const proxies = useRef<Group>(null);
  useForceCutaway();
  return (
    <>
      <Proxies group={proxies} all />
      <Highlights furniture={false} />
      <HaMarkers />
      <SelectionScreen />
      <CameraPresets />
      <ViewInset />
      <Controller mode="ha" proxies={proxies} />
    </>
  );
}
