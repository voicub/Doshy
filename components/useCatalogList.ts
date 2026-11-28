import { useEffect, useMemo, useRef, useState } from "react";
import { CATALOG, KINDS } from "@/lib/catalog";
import { searchKinds, sizeClass, type SizeClass } from "@/lib/catalogSearch";
import { scrollParent } from "@/lib/scrollParent";
import { useVp } from "@/lib/useVp";
import type { CatalogGroups, CatalogMode } from "./CatalogChips";

const PAGE = 36; // cards mounted at first, and added each time the end of the list comes within a screen: 1100 cards at once cost ~0.4 s of main-thread time to open the drawer

type Args = {
  needle: string;
  mode: CatalogMode;
  group: string;
  cat: string | null;
  body: string | null;
  size: SizeClass | null;
  groups: CatalogGroups;
  /** The kinds the user made or imported (newest first), their favourites and recents. */
  mineKinds: string[];
  favs: string[];
  recent: string[];
};

/** The kinds the catalog shows for the current search and filters, how many of them are mounted (paged as you scroll), and which card holds the arrow-key focus. */
export function useCatalogList({ needle, mode, group, cat, body, size, groups, mineKinds, favs, recent }: Args) {
  const kinds = useMemo(() => {
    let list: string[];
    if (needle) list = searchKinds(CATALOG, [...KINDS, ...mineKinds], needle);
    else if (mode === "mine") list = mineKinds;
    else if (mode === "favs") list = favs.filter((k) => CATALOG[k]);
    else if (mode === "recent") list = recent.filter((k) => CATALOG[k]);
    else {
      const inGroup = group === "all" ? null : groups.find((g) => g.id === group)?.cats;
      list = KINDS.filter((k) => {
        const d = CATALOG[k];
        if (cat ? d.cat !== cat : inGroup && !inGroup.includes(d.cat)) return false;
        return !body || d.tags?.split(/\s+/).includes(body);
      });
    }
    return (size ? list.filter((k) => sizeClass(CATALOG[k]) === size) : list).filter((k) => !CATALOG[k]?.pillar && !CATALOG[k]?.legacy); // columns and risers are edited in Plan mode; old car models are only kept for saved plans
  }, [needle, mode, group, cat, body, size, favs, recent, mineKinds, groups]);

  const [rove, setRove] = useState(0); // the one card in the tab order
  useEffect(() => setRove(0), [kinds]);

  const [shown, setShown] = useState(PAGE);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => setShown(PAGE), [kinds]);
  const { vp } = useVp();
  useEffect(() => {
    const el = end.current;
    if (!el || shown >= kinds.length) return;
    // the root is whatever scrolls the cards: the grid on a desktop, the whole sheet on a compact screen (see scrollParent). `vp` re-runs this when the layout changes between the two.
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && setShown((n) => n + PAGE), { root: scrollParent(el), rootMargin: "800px" });
    io.observe(el);
    return () => io.disconnect();
  }, [shown, kinds.length, vp]);

  return { kinds, shown, end, rove, setRove };
}
