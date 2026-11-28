"use client";
import { ArrivalSheet } from "../lazyPanels";
import { useArrivalUi } from "./arrivalUi";

export default function ArrivalHost() {
  const visible = useArrivalUi((s) => s.visible);
  return visible ? <ArrivalSheet /> : null;
}
