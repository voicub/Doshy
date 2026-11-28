"use client";
import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import GuestPin from "./GuestPin";
import { useGuestView } from "./useGuestView";
import "./guest.css";

// the 3D scene (three.js and the rest) is only downloaded once the link is known to work
const GuestScene = dynamic(() => import("./GuestScene"), { ssr: false });

const Card = ({ children }: { children: ReactNode }) => <main className="guest-shell">{children}</main>;

/** `/view/<token>`: a read-only look at one shared plan. Asks for the PIN when the link has one, says plainly when the link does not work (any more), else shows the home. */
export default function GuestViewer({ token }: { token: string }) {
  const { screen, enter, retry } = useGuestView(token);
  switch (screen.kind) {
    case "ready":
      return <GuestScene name={screen.name} live={screen.live} />;
    case "pin":
      return (
        <Card>
          <GuestPin token={token} onUnlocked={enter} />
        </Card>
      );
    case "gone":
      return (
        <Card>
          <section className="hud guest-card">
            <h1 className="guest-title">This link does not work</h1>
            <p className="guest-note">It may have expired, or the person who shared it has turned it off. Ask them for a new one.</p>
          </section>
        </Card>
      );
    case "problem":
      return (
        <Card>
          <section className="hud guest-card" role="alert">
            <h1 className="guest-title">Could not open this view</h1>
            <p className="guest-note">{screen.message}</p>
            <button type="button" className="btn primary" onClick={retry}>Try again</button>
          </section>
        </Card>
      );
    default:
      return (
        <Card>
          <p className="guest-wait" role="status">Opening the home...</p>
        </Card>
      );
  }
}
