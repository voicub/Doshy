"use client";
import { useState } from "react";
import { sizeLabel, type PackResult } from "@/lib/pieceShare";
import type { Choice, Conflict } from "@/lib/pieceShareMerge";
import PackThumb from "./PackThumb";
import "./sharePacks.css";

type Ok = Extract<PackResult, { ok: true }>;

export const CHOICES: { id: Choice; label: string; hint: string }[] = [
  { id: "both", label: "Keep both", hint: "Yours stays. The new piece gets a (2) after its name." },
  { id: "replace", label: "Replace mine", hint: "Yours is swapped for the new one. Items you placed take the new look." },
  { id: "skip", label: "Skip", hint: "The new piece is not added." },
];

const FIRST = 48; // a pack can hold 200 pieces: drawing them all at once would be slow on a small device

type Props = {
  read: Ok;
  conflicts: readonly Conflict[];
  choices: ReadonlyMap<string, Choice>;
  onChoice: (kind: string, c: Choice) => void;
  onAll: (c: Choice) => void;
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** What importing a pack will add: who made it, the pieces as pictures, warnings, and a plain choice for each piece that clashes with one of yours. */
export default function SharePackPreview({ read, conflicts, choices, onChoice, onAll }: Props) {
  const { info, pack, warnings } = read;
  const [more, setMore] = useState(false);
  const clash = new Map(conflicts.map((c) => [c.piece.kind, c]));
  const shown = more ? pack.pieces : pack.pieces.slice(0, FIRST);
  const picked = (kind: string): Choice => choices.get(kind) ?? "both";

  return (
    <div className="shr-section shp">
      <div className="shp-head">
        <b>{info.name}</b>
        {info.author && <span>by {info.author}</span>}
        {info.licence && <span className="selectable">Licence note: {info.licence}</span>}
        <span className="label">
          {plural(info.pieces, "piece", "pieces")}
          {info.modelPieces > 0 && ` (${info.modelPieces} with 3D models, ${sizeLabel(info.modelBytes)})`}
          {info.created && ` / made ${info.created.slice(0, 10)}`}
        </span>
      </div>

      {warnings.length > 0 && (
        <ul className="shp-warn field-note warn" role="status">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}

      <ul className="shp-grid" aria-label="Pieces in this pack">
        {shown.map((p) => {
          const c = clash.get(p.kind);
          return (
            <li key={p.kind}>
              <div className="shp-card" data-clash={c ? "1" : undefined} data-skip={c && picked(p.kind) === "skip" ? "1" : undefined}>
                <PackThumb piece={p} />
                <span className="shp-name">{p.name}</span>
                <span className="shp-sub">{c ? `Like your "${c.mine.name}"` : p.model ? "3D model" : "Shapes"}</span>
              </div>
            </li>
          );
        })}
      </ul>
      {!more && pack.pieces.length > FIRST && (
        <button type="button" className="cat-link" onClick={() => setMore(true)}>
          Show all {pack.pieces.length} pieces
        </button>
      )}

      {conflicts.length > 0 && (
        <div className="shp-conflicts">
          <p className="field-note">
            {plural(conflicts.length, "piece is", "pieces are")} already in My pieces (same name or same piece). What should happen?
          </p>
          <div className="seg shp-seg" role="group" aria-label="For all of them">
            {CHOICES.map((c) => (
              <button key={c.id} type="button" aria-pressed={conflicts.every((x) => picked(x.piece.kind) === c.id)} onClick={() => onAll(c.id)}>
                {c.label}
              </button>
            ))}
          </div>
          <details className="shr-adv">
            <summary>Choose for each piece</summary>
            {conflicts.map((c) => (
              <label key={c.piece.kind} className="field shp-each">
                <span className="label">{c.piece.name}</span>
                <select value={picked(c.piece.kind)} onChange={(e) => onChoice(c.piece.kind, CHOICES.find((x) => x.id === e.target.value)?.id ?? "both")} aria-label={`What to do with ${c.piece.name}`}>
                  {CHOICES.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.label}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </details>
          <ul className="shp-hints field-note">
            {CHOICES.map((c) => (
              <li key={c.id}>
                <b>{c.label}:</b> {c.hint}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
