"use client";
import { useDeferredValue, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { CATALOG, CATEGORIES, KINDS } from "@/lib/catalog";
import { groupCategories, type SizeClass } from "@/lib/catalogSearch";
import { MY_PIECES, draftFromDef, missingKinds, type CustomPiece } from "@/lib/customCatalog";
import { useCustom } from "@/lib/customStore";
import { clamp } from "@/lib/mathUtil";
import { errorMessage } from "@/lib/guards";
import { useStore } from "@/lib/store";
import { useVp } from "@/lib/useVp";
import { useCarModels } from "@/lib/carModelStore";
import { Card, type CardActions } from "./CatalogCard";
import CatalogLines from "./CatalogLines";
import CatalogChips, { type CatalogMode } from "./CatalogChips";
import CatalogFilters from "./CatalogFilters";
import CatalogOwn from "./CatalogOwn";
import CatalogSearch from "./CatalogSearch";
import ModelImport from "./ModelImport";
import { PolyHavenModelPick } from "./lazyPanels";
import type { PhItem } from "@/lib/polyhaven";
import { CreditsLink } from "./CarCredits";
import { CarTools } from "./CarAuto";
import PieceBuilder, { type Draft } from "./PieceBuilder";
import { useEditUi } from "./scene/edit/editStore";
import "./scene/edit/edit.css";
import HudPanel from "./ui/HudPanel";
import { readPiecesFile } from "./ui/planIO";
import { useCatalogList } from "./useCatalogList";
import "./catalogDrawer.css";
import "./compactCatalog.css";

const OFFERED = KINDS.filter((k) => !CATALOG[k].legacy && !CATALOG[k].pillar).length; // old car models are not offered, only kept for saved plans

type Modal = { t: "build"; draft: Draft; editing?: CustomPiece } | { t: "model"; piece?: CustomPiece; source?: { item: PhItem; file: File } } | { t: "ph" } | null;
type Note = { text: string; bad?: boolean };
const MODES: { id: CatalogMode; label: string }[] = [
  { id: "all", label: "Browse" },
  { id: "favs", label: "Favourites" },
  { id: "recent", label: "Recent" },
  { id: "mine", label: MY_PIECES },
];

/** What the card grid says when it has no cards. */
function emptyText(needle: string, mode: CatalogMode): string {
  if (needle) return `No match for "${needle}".\nTry another word, or make it yourself in ${MY_PIECES}.`;
  if (mode === "favs") return "No favourites yet.\nPress the star on a piece to keep it here.";
  if (mode === "recent") return "Nothing placed yet.\nPieces you place show up here.";
  if (mode === "mine") return "Nothing here yet.\nPick one of the three ways above.";
  return "Nothing matches these filters.";
}

/** Arrow keys move between the cards of the grid (up and down by a row). */
function moveFocus(e: KeyboardEvent<HTMLDivElement>) {
  const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 0, ArrowUp: 0 }[e.key];
  const target = e.target;
  if (step === undefined || !(target instanceof HTMLElement) || !target.classList.contains("cat-main")) return;
  const mains = [...e.currentTarget.querySelectorAll<HTMLElement>(".cat-main")];
  const cols = getComputedStyle(e.currentTarget).gridTemplateColumns.split(" ").length;
  const delta = e.key === "ArrowDown" ? cols : e.key === "ArrowUp" ? -cols : step;
  const to = clamp(mains.indexOf(target) + delta, 0, mains.length - 1);
  e.preventDefault();
  mains[to]?.focus();
}

/**
 * The furniture catalog, docked left in the furniture view. Click a card to place with a ghost that follows the cursor over the 3D scene
 * (Shift keeps placing, Esc cancels), or drag it onto the scene and drop it where it should stand. Search understands plain words
 * ("couch" finds sofas); "My pieces" holds what you made or imported.
 */
export default function CatalogDrawer({ onClose }: { onClose: () => void }) {
  const { vp, coarse } = useVp();
  const tiny = vp !== "regular"; // compact: 800x480, 1024x600 and phones
  const hasRealModels = useCarModels((s) => Object.keys(s.models).length > 0 || s.autoFetch);
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  const items = useStore((s) => s.plan.items);
  const recent = useEditUi((s) => s.recent);
  const pieces = useCustom((s) => s.pieces);
  const favs = useCustom((s) => s.favs);
  const [q, setQ] = useState("");
  const [mode, setMode] = useState<CatalogMode>("all");
  const [group, setGroup] = useState("all");
  const [cat, setCat] = useState<string | null>(null);
  const [body, setBody] = useState<string | null>(null);
  const [size, setSize] = useState<SizeClass | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [note, setNote] = useState<Note | null>(null);
  const grid = useRef<HTMLDivElement>(null);
  const needle = useDeferredValue(q.trim());
  const active = tool.startsWith("add:") ? tool.slice(4) : null;

  const groups = useMemo(() => groupCategories(CATEGORIES), []);
  const counts = useMemo(() => {
    const n: Record<string, number> = {};
    for (const k of KINDS) if (!CATALOG[k].pillar && !CATALOG[k].legacy) n[CATALOG[k].cat] = (n[CATALOG[k].cat] ?? 0) + 1; // pillars are drawn in Plan mode
    return n;
  }, []);
  const pieceOf = useMemo(() => new Map(pieces.map((p) => [p.kind, p])), [pieces]);
  const mineKinds = useMemo(() => [...pieces].reverse().map((p) => p.kind), [pieces]);
  const missing = useMemo(() => missingKinds(pieces, items), [pieces, items]);
  const favSet = useMemo(() => new Set(favs), [favs]);
  const hasCars = useMemo(() => items.some((i) => CATALOG[i.kind]?.car), [items]);
  const { kinds, shown, end, rove, setRove } = useCatalogList({ needle, mode, group, cat, body, size, groups, mineKinds, favs, recent });

  // card callbacks are created once (they read the latest state through a ref), so cards that did not change skip rendering
  const live = useRef({ active, setTool, tiny, onClose });
  live.current = { active, setTool, tiny, onClose };
  const act = useMemo<CardActions>(
    () => ({
      pick: (k) => {
        const l = live.current;
        setNote(null);
        l.setTool(l.active === k ? "select" : `add:${k}`);
        if (l.tiny && l.active !== k) l.onClose(); // the sheet gets out of the way: the piece waits on the canvas for a tap on the floor (EditStrip)
      },
      fav: (k) => useCustom.getState().toggleFav(k),
      tweak: (k) => setModal({ t: "build", draft: draftFromDef(CATALOG[k]) }),
      edit: (p) => setModal(p.model ? { t: "model", piece: p } : { t: "build", draft: { name: p.name, parts: p.parts, light: p.light, wall: p.wall }, editing: p }),
      del: (p) => {
        const used = useStore.getState().plan.items.filter((i) => i.kind === p.kind).length;
        const text = used ? `Delete "${p.name}"? The ${used} in your plan will turn into grey boxes.` : `Delete "${p.name}"?`;
        if (confirm(text)) useCustom.getState().remove(p.kind);
      },
      focus: setRove,
    }),
    [setRove],
  );

  const done = (placeKind?: string) => {
    setModal(null);
    if (!placeKind) return;
    setMode("mine");
    setQ("");
    setTool(`add:${placeKind}`);
    if (tiny) onClose();
  };
  const importPieces = async (f: File) => {
    try {
      const n = await readPiecesFile(f);
      setNote({ text: n ? `Added ${n} piece${n === 1 ? "" : "s"} to My pieces.` : "Those pieces are already here." });
    } catch (e) {
      setNote({ text: `Could not import: ${errorMessage(e)}`, bad: true });
    }
  };
  const chooseGroup = (id: string) => {
    setGroup(id);
    setCat(null);
    setBody(null);
  };
  const chooseCat = (c: string | null) => {
    setCat(c);
    setBody(null);
  };
  const pickMode = (m: CatalogMode) => {
    setMode(m);
    setNote(null);
    setQ("");
  };
  const filter = { group, cat, body, size };

  return (
    <HudPanel title="Furniture" meta={`${kinds.length} / ${OFFERED + pieces.length}`} onClose={onClose} className="drawer dock-left catalog">
      <CatalogSearch value={q} onChange={setQ} keyboardSearch={tiny || coarse} tiny={tiny} placing={!!active} firstKind={kinds[0]} onPlace={(k) => setTool(`add:${k}`)} onCancelPlace={() => setTool("select")} onClose={onClose} grid={grid} />

      {tiny ? (
        <CatalogChips
          modes={MODES}
          mode={mode}
          searching={!!needle}
          missing={missing.length > 0}
          onMode={pickMode}
          groups={groups}
          counts={counts}
          filter={filter}
          onGroup={chooseGroup}
          onCat={chooseCat}
          onBody={setBody}
          onSize={setSize}
          more={
            hasRealModels || hasCars ? (
              <>
                <CreditsLink />
                <CarTools />
              </>
            ) : undefined
          }
        />
      ) : (
        <CatalogFilters modes={MODES} mode={mode} needle={needle} missing={missing.length > 0} onMode={pickMode} groups={groups} counts={counts} filter={filter} onGroup={chooseGroup} onCat={chooseCat} onBody={setBody} onSize={setSize} />
      )}

      {!needle && mode === "mine" && (
        <CatalogOwn
          missing={missing.length}
          onImportModel={() => setModal({ t: "model" })}
          onImportPolyHaven={() => setModal({ t: "ph" })}
          onBuild={() => setModal({ t: "build", draft: { name: "My piece", parts: [] } })}
          onCopy={() => {
            pickMode("all");
            setNote({ text: "Press the copy icon on any piece to change it and keep your own version." });
          }}
          onImportFile={(f) => void importPieces(f)}
        />
      )}
      {note && (
        <p className={`field-note${note.bad ? " warn" : " ok"}`} role="status">
          {note.text}
        </p>
      )}
      {!tiny && (
        <>
          <CreditsLink />
          <CarTools />
        </>
      )}

      {!needle && mode === "all" && <CatalogLines />}
      <div className="cards" ref={grid} role="list" aria-label="Pieces" onKeyDown={moveFocus}>
        {kinds.slice(0, shown).map((k, i) => (
          <Card key={k} k={k} i={i} active={active === k} fav={favSet.has(k)} tab={i === rove} coarse={coarse} piece={pieceOf.get(k)} act={act} />
        ))}
        {shown < kinds.length && <div ref={end} aria-hidden style={{ gridColumn: "1 / -1", height: 1 }} />}
        {!kinds.length && <p className="empty">{emptyText(needle, mode)}</p>}
      </div>

      {modal?.t === "build" && <PieceBuilder draft={modal.draft} editing={modal.editing} onClose={done} />}
      {modal?.t === "model" && <ModelImport piece={modal.piece} source={modal.source} onClose={done} />}
      {modal?.t === "ph" && <PolyHavenModelPick onPicked={(item, file) => setModal({ t: "model", source: { item, file } })} onClose={() => setModal(null)} />}
    </HudPanel>
  );
}
