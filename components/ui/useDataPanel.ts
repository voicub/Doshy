"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useCustom } from "@/lib/customStore";
import { ApiError, NetError, deleteResource, fetchInfo, fetchResources, fetchVersions, importBackup, restoreVersion, saveVersion } from "@/lib/dbApi";
import type { DbInfo, ResourceList, Version } from "@/lib/dbApi";
import { activePlanId, adoptServerPlan, discardLocalAndReload, flushNow, restoreStash, stashEntries } from "@/lib/dbClient";
import type { StashEntry } from "@/lib/planStash";
import { deleteModel } from "@/lib/modelStore";

const REFRESH_MS = 10_000;

/** The plan on screen (versions belong to one plan). Null only while Doshy is still loading. */
const planNow = () => {
  const id = activePlanId();
  if (id === null) throw new ApiError(409, "loading", "Doshy is still loading. Try again in a moment.");
  return id;
};

export type DataSnapshot = { info: DbInfo; versions: Version[]; files: ResourceList };
type Note = { ok: boolean; text: string };

/** Plain-language reason for a failed call. Only ApiError messages are written for people. */
const say = (e: unknown) =>
  e instanceof NetError ? "The server cannot be reached. Your changes are safe on this device and will sync when it is back." : e instanceof ApiError ? e.message : "Something went wrong. Please try again.";

/** The server's numbers, versions and files, refreshed every REFRESH_MS. A slow older answer never overwrites a newer one. `problem` is the last refresh failure. */
function useServerData() {
  const [data, setData] = useState<DataSnapshot | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const seq = useRef(0); // answers from older requests are ignored

  const load = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const [info, versions, files] = await Promise.all([fetchInfo(), fetchVersions(planNow()), fetchResources()]);
      if (mine !== seq.current) return;
      setData({ info, versions, files });
      setProblem(null);
    } catch (e) {
      if (mine === seq.current) setProblem(say(e));
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), REFRESH_MS);
    return () => {
      clearInterval(t);
      seq.current++;
    };
  }, [load]);
  return { data, problem, load };
}

/** State and actions of the Data and backups panel: polls the server, runs each command and reports the outcome in `note`. */
export default function useDataPanel() {
  const { data, problem, load } = useServerData();
  const [kept, setKept] = useState(() => stashEntries()); // plans this device kept (read from localStorage)
  const [note, setNote] = useState<Note | null>(null);
  const [busy, setBusy] = useState<null | "work" | "import">(null);
  const [name, setName] = useState("");
  const [ask, setAsk] = useState<string | null>(null); // "restore:<id>" or "delete:<id>"
  const [file, setFile] = useState<File | null>(null); // backup waiting for the user's yes

  const act = async (fn: () => Promise<string>) => {
    setBusy("work");
    setAsk(null);
    try {
      setNote({ ok: true, text: await fn() });
    } catch (e) {
      setNote({ ok: false, text: say(e) });
    }
    setBusy(null);
    await load();
  };

  const save = (e: FormEvent) => {
    e.preventDefault();
    void act(async () => {
      await flushNow(); // the version must contain the latest edits
      await saveVersion(planNow(), name.trim());
      setName("");
      return "Version saved";
    });
  };

  const restore = (id: number) =>
    act(async () => {
      await flushNow(); // so the plan being replaced is kept as a version with the latest edits
      adoptServerPlan(await restoreVersion(planNow(), id));
      return "Restored";
    });

  const remove = (r: { id: string; kind: string }) =>
    act(async () => {
      if (r.kind === "piece") useCustom.getState().remove(r.id);
      else if (r.kind === "model") await deleteModel(r.id);
      await deleteResource(r.id); // already gone counts as done
      return "Deleted";
    });

  const doImport = async (f: File) => {
    setFile(null);
    setBusy("import");
    setNote(null);
    try {
      await importBackup(f);
      discardLocalAndReload();
    } catch (e) {
      setNote({ ok: false, text: say(e) });
      setBusy(null);
    }
  };

  const restoreKept = (e: StashEntry) => {
    restoreStash(e);
    setKept(stashEntries());
    setNote({ ok: true, text: "Restored. The plan you had before is kept too." });
  };

  return { kept, data, problem, note, busy, name, setName, ask, setAsk, file, setFile, load, save, restore, remove, doImport, restoreKept };
}
