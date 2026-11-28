"use client";
import dynamic from "next/dynamic";

// Browser only: the stores and three.js need the browser, and this page must find out it is the guest page (location) before any store starts (lib/guestMode).
const GuestViewer = dynamic(() => import("./GuestViewer"), { ssr: false });

export default function GuestEntry({ token }: { token: string }) {
  return <GuestViewer token={token} />;
}
