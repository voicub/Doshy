import { CameraIcon, LinkIcon, PackageIcon, VideoCameraIcon } from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import type { ComponentType, ReactNode } from "react";
import type { SharePage } from "./shareUi";

/** What the Share dialog hands each page. A page draws only its body: the dialog supplies the title, the close button and the way back to the list. */
export type SharePageProps = {
  /** Back to the list of things to share. */
  onBack: () => void;
  /** Close the whole dialog (for example while a picture is being taken: the dialog gets out of the way). */
  onClose: () => void;
  /** The plan a link is about (null = the plan on screen). */
  planId: number | null;
};

export type SharePageDef = { id: Exclude<SharePage, "menu">; title: string; blurb: string; icon: ReactNode; Page: ComponentType<SharePageProps> };

/**
 * The things the Share dialog offers, in the order shown. Each page loads the first time it is opened (use `next/dynamic` so the kiosk never downloads
 * them). Adding a page: build its component, then add one entry here.
 */
export const SHARE_PAGES: SharePageDef[] = [
  { id: "snapshot", title: "Take a picture", blurb: "Save the 3D view as a sharp PNG, on a transparent background if you like", icon: <CameraIcon size={18} />, Page: dynamic(() => import("./SnapshotPage")) },
  { id: "video", title: "Record a turntable video", blurb: "A slow spin round the home, saved as a video file", icon: <VideoCameraIcon size={18} />, Page: dynamic(() => import("./VideoPage")) },
  { id: "link", title: "Share a read-only link", blurb: "A web address that lets someone look around the home, with a PIN if you like", icon: <LinkIcon size={18} />, Page: dynamic(() => import("./GuestLinks")) },
  { id: "pack", title: "My pieces", blurb: "Pack your own furniture into a file, or add a pack from someone else", icon: <PackageIcon size={18} />, Page: dynamic(() => import("./SharePacks")) },
];
