import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { downloadModel, FinderError, keepCarModel, searchCars } from "@/lib/carImport";
import { useCarModels } from "@/lib/carModelStore";
import { searchWords, type CarModelEntry } from "@/lib/carModels";
import type { CarSpec } from "@/lib/cars";
import type { SearchHit } from "@/lib/modelLibrary";
import { deleteModel } from "@/lib/modelStore";

type FinderStep = "search" | "working" | "fit";

/** What the search box starts with and the other names worth trying (`searchWords` of the car). */
type CarSearchWords = { query: string; alternatives: string[] };

const WIDEN_UNTIL = 6; // the first search also tries other names until this many models are found
const isAbort = (e: unknown) => e instanceof Error && e.name === "AbortError"; // Cancel aborted the download
const forget = (entry: CarModelEntry) => void deleteModel(entry.resource).catch(() => undefined);

/** Whether the finder is still open, and the download in flight: shared by the search and the import. */
type Live = { alive: MutableRefObject<boolean>; abort: MutableRefObject<AbortController | null> };

type CarSearch = {
  q: string;
  setQ: (q: string) => void;
  heavy: boolean;
  setHeavy: (on: boolean) => void;
  hits: SearchHit[];
  /** Cursor of the next page, if there is one. */
  next: string | null;
  canDownload: boolean;
  setCanDownload: (ok: boolean) => void;
  searching: boolean;
  searched: boolean;
  search: (query: string, more?: boolean, widen?: boolean) => Promise<void>;
};

/** Searching Sketchfab: once on open, and again whenever "heavy" changes. */
function useCarSearch(words: CarSearchWords, { alive, abort }: Live, setErr: (e: FinderError | null) => void): CarSearch {
  const [q, setQ] = useState(words.query);
  const [heavy, setHeavy] = useState(false);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [canDownload, setCanDownload] = useState(true);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  const search = async (query: string, more = false, widen = false) => {
    setSearching(true);
    setErr(null);
    try {
      const page = await searchCars(query, { cursor: more ? next : null, heavy });
      if (!alive.current) return;
      let found = page.hits;
      let after = page.next;
      // few results for the full name: also look under the plainer and regional names, so the first screen is not empty
      for (const alt of widen ? words.alternatives.slice(0, 3) : []) {
        if (found.length >= WIDEN_UNTIL) break;
        const extra = await searchCars(alt, { cursor: null, heavy });
        if (!alive.current) return;
        found = [...found, ...extra.hits.filter((h) => !found.some((f) => f.uid === h.uid))];
        after = null;
      }
      setHits((h) => (more ? [...h, ...found] : found));
      setNext(after);
      setCanDownload(page.canDownload);
      setSearched(true);
    } catch (e) {
      if (alive.current && !isAbort(e)) setErr(e instanceof FinderError ? e : new FinderError("upstream", "The search did not work. Try again in a minute."));
    } finally {
      if (alive.current) setSearching(false);
    }
  };

  useEffect(() => {
    alive.current = true;
    void search(q, false, true);
    return () => {
      alive.current = false;
      abort.current?.abort();
    };
    // runs on open and when "heavy" changes only: the query is sent when the user presses Search, and `search` reads the latest state itself
  }, [heavy]);

  return { q, setQ, heavy, setHeavy, hits, next, canDownload, setCanDownload, searching, searched, search };
}

export type CarFinder = {
  words: CarSearchWords;
  step: FinderStep;
  err: FinderError | null;
  search: CarSearch;
  fullDetail: boolean;
  setFullDetail: (on: boolean) => void;
  progress: { f: number; label: string };
  /** The prepared model being fitted. */
  draft: CarModelEntry | null;
  setDraft: (e: CarModelEntry | null) => void;
  /** Download, optimise and fit a model; a Sketchfab link or id works too. */
  use: (hit: Pick<SearchHit, "uid">) => Promise<void>;
  /** Stop the download in progress and go back to the search. */
  cancel: () => void;
  /** Throw the prepared model away and go back to the search. */
  discard: () => void;
  /** Use the fitted model for every car of this kind. */
  keep: () => void;
};

/** The three steps of "Make this car look exact": search, download and prepare, fit. */
export function useCarFinder(spec: CarSpec, initial: CarModelEntry | undefined, onClose: () => void): CarFinder {
  const words = useMemo(() => searchWords(spec), [spec]);
  const [step, setStep] = useState<FinderStep>(initial ? "fit" : "search");
  const [err, setErr] = useState<FinderError | null>(null);
  const [fullDetail, setFullDetail] = useState(false);
  const [progress, setProgress] = useState({ f: 0, label: "Downloading" });
  const [draft, setDraft] = useState<CarModelEntry | null>(initial ?? null);
  const live: Live = { alive: useRef(true), abort: useRef<AbortController | null>(null) };
  const run = useRef(0); // bumped by Cancel: an import that finishes after it is thrown away
  const saved = useRef(false);
  const draftRef = useRef<CarModelEntry | null>(null);
  draftRef.current = draft;
  const search = useCarSearch(words, live, setErr);

  // a model that was prepared but never kept is deleted again
  useEffect(
    () => () => {
      const d = draftRef.current;
      if (d && !saved.current && d.resource !== initial?.resource) forget(d);
    },
    [],
  );

  const use: CarFinder["use"] = async (hit) => {
    const mine = ++run.current;
    const stale = () => !live.alive.current || mine !== run.current;
    setErr(null);
    setStep("working");
    setProgress({ f: 0.05, label: "Downloading from Sketchfab" });
    live.abort.current = new AbortController();
    try {
      const { buf, attribution } = await downloadModel(hit.uid, live.abort.current.signal);
      if (stale()) return;
      const { entry } = await keepCarModel(buf, attribution, (f, label) => !stale() && setProgress({ f, label }), { fullDetail });
      if (stale()) return forget(entry);
      setDraft(entry);
      setStep("fit");
    } catch (e) {
      if (stale() || isAbort(e)) return;
      setErr(e instanceof FinderError ? e : new FinderError("invalid_model", (e instanceof Error && e.message) || "That model could not be read. Try another one."));
      setStep("search");
    }
  };
  const cancel = () => {
    run.current++;
    live.abort.current?.abort();
    setStep("search");
  };
  const discard = () => {
    if (draft && draft.resource !== initial?.resource) forget(draft);
    setDraft(null);
    setStep("search");
  };
  const keep = () => {
    if (!draft) return;
    saved.current = true;
    useCarModels.getState().assign(spec.id, draft);
    onClose();
  };

  return { words, step, err, search, fullDetail, setFullDetail, progress, draft, setDraft, use, cancel, discard, keep };
}
