"use client";
import { CopyIcon, PencilSimpleIcon, StarIcon, TrashIcon } from "@phosphor-icons/react";
import { memo, useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import { CATALOG } from "@/lib/catalog";
import type { CustomPiece } from "@/lib/customCatalog";
import RealModelBadge from "./RealModelBadge";
import { KIND_MIME } from "./scene/edit/Controller";
import { useEditUi } from "./scene/edit/editStore";
import TopDown from "./TopDown";

const PAD = 0.1;
const MARGIN = "240px"; // thumbnails are drawn this far before they scroll into view and dropped again once they are this far away

// One shared observer for every card: a catalog of hundreds of pieces draws only the thumbnails you can see.
const watchers = new WeakMap<Element, (seen: boolean) => void>();
let observer: IntersectionObserver | null = null;
function watch(el: Element, cb: (seen: boolean) => void) {
  observer ??= new IntersectionObserver((es) => es.forEach((e) => watchers.get(e.target)?.(e.isIntersecting)), { rootMargin: MARGIN });
  watchers.set(el, cb);
  observer.observe(el);
  return () => {
    observer?.unobserve(el);
    watchers.delete(el);
  };
}

function Lazy({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => (ref.current ? watch(ref.current, setSeen) : undefined), []);
  return (
    <div ref={ref} className="cat-thumb">
      {seen && children}
    </div>
  );
}

function Thumb({ kind, piece }: { kind: string; piece?: CustomPiece }) {
  const d = CATALOG[kind];
  if (piece?.thumb) return <img src={piece.thumb} alt="" draggable={false} />;
  return (
    <svg viewBox={`${-d.w / 2 - PAD} ${-d.d / 2 - PAD} ${d.w + PAD * 2} ${d.d + PAD * 2}`} preserveAspectRatio="xMidYMid meet" aria-hidden>
      <TopDown def={d} />
    </svg>
  );
}

/** Drag image: the card's thumbnail, cloned off-screen for the browser to snapshot. */
function dragImage(e: DragEvent<HTMLElement>) {
  const pic = e.currentTarget.querySelector("svg, img");
  if (!pic) return;
  const host = document.createElement("div");
  host.className = "drag-ghost";
  host.appendChild(pic.cloneNode(true));
  document.body.appendChild(host);
  e.dataTransfer.setDragImage(host, 48, 36);
  setTimeout(() => host.remove(), 0);
}

/** What a card's buttons do; created once by the drawer so cards that did not change skip rendering. */
export type CardActions = {
  pick: (k: string) => void;
  fav: (k: string) => void;
  tweak: (k: string) => void;
  edit: (p: CustomPiece) => void;
  del: (p: CustomPiece) => void;
  focus: (i: number) => void;
};

type CardProps = { k: string; i: number; active: boolean; fav: boolean; tab: boolean; coarse: boolean; piece?: CustomPiece; act: CardActions };

const cm = (m: number) => Math.round(m * 100);

/** One piece of the catalog: a draggable thumbnail card with its favourite / edit / copy buttons. */
export const Card = memo(function Card({ k, i, active, fav, tab, coarse, piece, act }: CardProps) {
  const d = CATALOG[k];
  if (!d) return null;
  const t = tab ? 0 : -1;
  return (
    <div className="cat-card" role="listitem">
      <button
        className={`card cat-main${active ? " active" : ""}`}
        aria-pressed={active}
        tabIndex={t}
        title={`${d.label} (${d.cat})`}
        onClick={() => act.pick(k)}
        onFocus={() => act.focus(i)}
        draggable={!coarse} // a finger places by tapping (a long-press drag is fragile on a touch screen)
        onDragStart={(e) => {
          e.dataTransfer.setData(KIND_MIME, k);
          e.dataTransfer.effectAllowed = "copy";
          dragImage(e);
          useEditUi.getState().set({ dragKind: k });
        }}
        onDragEnd={() => useEditUi.getState().set({ dragKind: null, ghost: null })}
      >
        <Lazy>
          <Thumb kind={k} piece={piece} />
        </Lazy>
        {d.car && <RealModelBadge kind={k} />}
        <span className="card-label">{d.label}</span>
        <span className="card-meta">{`${piece ? "My piece" : d.brand}  ${cm(d.w)} x ${cm(d.d)} cm`}</span>
      </button>
      <div className={`cat-act${fav ? " has-fav" : ""}`}>
        <button className={`cat-btn cat-star${fav ? " on" : ""}`} tabIndex={t} aria-pressed={fav} aria-label={fav ? `Remove ${d.label} from favourites` : `Add ${d.label} to favourites`} title="Favourite" onClick={() => act.fav(k)}>
          <StarIcon size={13} weight={fav ? "fill" : "regular"} />
        </button>
        {piece ? (
          <>
            <button className="cat-btn" tabIndex={t} aria-label={`Edit ${d.label}`} title="Edit" onClick={() => act.edit(piece)}>
              <PencilSimpleIcon size={13} />
            </button>
            <button className="cat-btn" tabIndex={t} aria-label={`Delete ${d.label}`} title="Delete" onClick={() => act.del(piece)}>
              <TrashIcon size={13} />
            </button>
          </>
        ) : (
          <button className="cat-btn" tabIndex={t} aria-label={`Copy ${d.label} and tweak it`} title="Copy and tweak" onClick={() => act.tweak(k)}>
            <CopyIcon size={13} />
          </button>
        )}
      </div>
    </div>
  );
});
