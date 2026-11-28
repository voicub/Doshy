"use client";
import { usePresence } from "@/lib/presenceStore";
import { usePeopleUi } from "./peopleUi";
import Segmented from "./Segmented";

const ON_OFF = ["off", "on"] as const;

/** The Display settings row: people in the home, on or off, and the way to the People sheet (`onOpen` closes the settings first). */
export default function PeopleSwitch({ onOpen }: { onOpen: () => void }) {
  const show = usePresence((s) => s.show);
  return (
    <>
      <Segmented label="People in the home" value={show ? "on" : "off"} options={ON_OFF} format={(o) => (o === "on" ? "On" : "Off")} onChange={(o) => usePresence.getState().setShow(o === "on")} />
      <p className="hint">Each person who is home shows up as a small figure in their room (a flat disc with their letter on a small screen). Off draws nobody.</p>
      <button type="button" className="btn" onClick={() => { onOpen(); usePeopleUi.getState().setOpen(true); }}>Choose who shows up</button>
    </>
  );
}
