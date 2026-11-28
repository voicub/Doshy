"use client";
import { TrashIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { useCustom } from "@/lib/customStore";
import { packGroups, type PackGroup } from "@/lib/pieceShareMerge";
import { placedCount, removePack } from "./packApply";
import "./sharePacks.css";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The packs you have added, each removable as a whole. Removing says first how many placed items would turn into grey boxes. */
export default function SharePackList() {
  const pieces = useCustom((s) => s.pieces);
  const groups = useMemo(() => packGroups(pieces), [pieces]);
  const [ask, setAsk] = useState<{ id: string; placed: number } | null>(null);
  if (!groups.length) return null;

  const confirmText = (g: PackGroup, placed: number) =>
    `Remove "${g.pack.name}"? Its ${plural(g.kinds.length, "piece", "pieces")} will be deleted from My pieces.${placed ? ` The ${plural(placed, "item", "items")} you placed in this plan will turn into grey boxes.` : ""} Other plans that use them will show grey boxes too.`;

  return (
    <section className="shr-section shp" aria-label="Imported packs">
      <span className="label">Packs you added</span>
      <ul className="shp-packs">
        {groups.map((g) => (
          <li key={g.pack.id} className="shp-pack">
            <div className="shp-pack-main">
              <b>{g.pack.name}</b>
              <span className="shp-sub">
                {plural(g.kinds.length, "piece", "pieces")}
                {g.pack.author && ` / by ${g.pack.author}`}
              </span>
              {g.pack.licence && <span className="shp-sub selectable">Licence note: {g.pack.licence}</span>}
            </div>
            {ask?.id === g.pack.id ? (
              <div className="shp-confirm" role="alertdialog" aria-label="Remove this pack?">
                <p className="field-note warn">{confirmText(g, ask.placed)}</p>
                <div className="shr-actions">
                  <button type="button" className="btn danger" onClick={() => { removePack(g); setAsk(null); }}>
                    Remove {plural(g.kinds.length, "piece", "pieces")}
                  </button>
                  <button type="button" className="btn" onClick={() => setAsk(null)}>
                    Keep them
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className="btn danger" onClick={() => setAsk({ id: g.pack.id, placed: placedCount(g.kinds) })}>
                <TrashIcon size={14} /> Remove pack
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
