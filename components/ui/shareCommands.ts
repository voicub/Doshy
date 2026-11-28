"use client";
import type { Cmd } from "./paletteCommands";
import { useShareUi, type SharePage } from "./shareUi";

const ENTRIES: { id: string; page: SharePage; label: string; hay: string; meta: string }[] = [
  { id: "share", page: "menu", label: "Share...", hay: "Share picture snapshot video link guest pieces pack", meta: "Picture, video, link, pieces" },
  { id: "snapshot", page: "snapshot", label: "Take a picture of the 3D view...", hay: "snapshot screenshot picture photo png image save render high resolution", meta: "Save as a PNG" },
  { id: "video", page: "video", label: "Record a turntable video...", hay: "turntable video record movie spin rotate 360 orbit webm mp4", meta: "A slow spin around the home" },
  { id: "link", page: "link", label: "Share a read-only link...", hay: "share link guest read only view pin password invite visitor", meta: "Let someone look around" },
  { id: "pack", page: "pack", label: "Share my pieces (furniture pack)...", hay: "furniture pack export import share pieces doshypack custom my pieces", meta: "Export or import a .doshypack file" },
];

/** The palette entries of the Share dialog: one for the list, one for each thing it can do. */
export function shareCommands(): Cmd[] {
  return ENTRIES.map((e): Cmd => ({ id: `act:${e.id}`, group: "Actions", label: e.label, hay: e.hay, meta: e.meta, run: () => useShareUi.getState().show(e.page) }));
}
