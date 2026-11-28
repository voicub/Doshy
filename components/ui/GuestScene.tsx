"use client";
import { useEffect, useMemo } from "react";
import { levelsOf } from "@/lib/levels";
import { useStore } from "@/lib/store";
import Scene3D from "../Scene3D";
import Atmosphere from "./Atmosphere";
import LevelSwitcher from "./LevelSwitcher";
import LevelViewToggle from "./LevelViewToggle";
import RoomIsolate from "./RoomIsolate";
import WalkButton from "./WalkButton";
import WalkHud from "./WalkHud";

/** One chip per room (a room's extensions are part of it) and one for the whole home: the guest's way to look at a single room. */
function GuestRooms() {
  const all = useStore((s) => s.plan.rooms);
  const rooms = useMemo(() => all.filter((r) => !r.parent), [all]);
  const isolated = useStore((s) => s.isolatedRoom);
  if (rooms.length < 2) return null;
  const whole = () => useStore.setState({ isolatedRoom: null, focusRoom: null });
  return (
    <nav className="hud guest-rooms" aria-label="Rooms">
      <button type="button" className="guest-room" aria-pressed={isolated === null} onClick={whole}>Whole home</button>
      {rooms.map((r) => (
        <button key={r.id} type="button" className="guest-room" aria-pressed={isolated === r.id} onClick={() => useStore.getState().setIsolatedRoom(r.id)}>
          {r.name}
        </button>
      ))}
    </nav>
  );
}

/** The shared home: the 3D scene to turn, zoom and look into, with the name of the plan and the rooms. Nothing here can change the plan or reach a device. */
export default function GuestScene({ name, live }: { name: string; live: boolean }) {
  const multiLevel = useStore((s) => levelsOf(s.plan).length > 1);
  useEffect(() => {
    document.title = `${name} - Doshy`;
  }, [name]);
  return (
    <div className={`app view-live guest-app ${multiLevel ? "multi-level" : ""}`}>
      <section className="stage">
        <Scene3D />
      </section>
      <Atmosphere view="live" />
      <div className="chrome">
        <header className="hud guest-bar">
          <span className="guest-brand">Doshy</span>
          <h1 className="guest-name">{name}</h1>
          <span className="guest-tag">Read-only view</span>
          {live && <span className="guest-tag guest-live">Live</span>}
          <WalkButton />
        </header>
        <LevelSwitcher />
        {multiLevel && <LevelViewToggle />}
        <RoomIsolate />
        <GuestRooms />
        <WalkHud />
      </div>
    </div>
  );
}
