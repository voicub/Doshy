import type { Def } from "@/lib/catalog";
import type { CustomPiece } from "@/lib/customCatalog";
import TopDown from "../TopDown";

const PAD = 0.1;

/** A piece from above, drawn from its own shapes (or its picture, for a 3D model): works for pieces that are not in the catalog yet, like those of a pack about to be added. */
export default function PackThumb({ piece }: { piece: CustomPiece }) {
  if (piece.thumb) return <img className="shp-thumb" src={piece.thumb} alt="" draggable={false} />;
  const def: Def = { label: piece.name, brand: "Generic", cat: "Decor", w: piece.w, d: piece.d, h: piece.h, parts: piece.parts };
  return (
    <svg className="shp-thumb" viewBox={`${-piece.w / 2 - PAD} ${-piece.d / 2 - PAD} ${piece.w + PAD * 2} ${piece.d + PAD * 2}`} preserveAspectRatio="xMidYMid meet" aria-hidden>
      <TopDown def={def} />
    </svg>
  );
}
