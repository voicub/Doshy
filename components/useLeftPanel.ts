import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import { useStore } from "@/lib/store";

type PlainKind = "plex" | "building" | "newplan" | "data" | "graphics" | "site";
/** The left slide-over: one panel at a time. `n` re-keys it so opening it again starts it fresh (a palette entry can open the browser with a search). */
type Plain = { [K in PlainKind]: { kind: K; n: number } }[PlainKind];
type Left = { kind: "browser"; q: string; n: number } | { kind: "climate"; entity?: string; n: number } | Plain;

type Of<K extends Left["kind"]> = Extract<Left, { kind: K }> | null;

export type LeftPanel = {
  left: Left | null;
  setLeft: Dispatch<SetStateAction<Left | null>>;
  /** Each panel's state while it is the open one, else null. */
  browser: Of<"browser">;
  climate: Of<"climate">;
  plex: Of<"plex">;
  building: Of<"building">;
  newPlan: Of<"newplan">;
  data: Of<"data">;
  graphics: Of<"graphics">;
  site: Of<"site">;
  /** HA mode: "Map areas" opens the browser on that room's area sheet. */
  mapRoom: string | undefined;
  openBrowser: (q?: string, room?: string) => void;
  openClimate: (entity?: string) => void;
  openPlex: () => void;
  openBuilding: () => void;
  openData: () => void;
  openGraphics: () => void;
  openSite: () => void;
  toggleBrowser: () => void;
  toggleClimate: () => void;
  togglePlex: () => void;
  toggleBuilding: () => void;
  toggleNewPlan: () => void;
  toggleData: () => void;
  toggleGraphics: () => void;
  toggleSite: () => void;
  /** Map the areas of the selected room (or the first room) to Home Assistant areas. */
  onAreas: () => void;
  /** Close whatever is open on the left, and the catalog. */
  closeLeft: () => void;
};

/** The left slide-over's state and every way to open, toggle and close its panels. Opening one closes the catalog. */
export function useLeftPanel(setCatalog: (open: boolean) => void): LeftPanel {
  const [left, setLeft] = useState<Left | null>(null);
  const [mapRoom, setMapRoom] = useState<string | undefined>();
  const browser = left?.kind === "browser" ? left : null;
  const climate = left?.kind === "climate" ? left : null;
  const plex = left?.kind === "plex" ? left : null;
  const building = left?.kind === "building" ? left : null;
  const newPlan = left?.kind === "newplan" ? left : null;
  const data = left?.kind === "data" ? left : null;
  const graphics = left?.kind === "graphics" ? left : null;
  const site = left?.kind === "site" ? left : null;

  const openBrowser = (q = "", room?: string) => {
    setCatalog(false);
    setMapRoom(room);
    setLeft((l) => ({ kind: "browser", q, n: (l?.n ?? 0) + 1 }));
  };
  const openClimate = useCallback((entity?: string) => {
    setCatalog(false);
    setLeft((l) => ({ kind: "climate", entity, n: (l?.n ?? 0) + 1 }));
  }, [setCatalog]);
  const openPlain = useCallback((kind: PlainKind) => {
    setCatalog(false);
    setLeft((l) => ({ kind, n: (l?.n ?? 0) + 1 }));
  }, [setCatalog]);
  const openPlex = useCallback(() => openPlain("plex"), [openPlain]);
  const openBuilding = useCallback(() => openPlain("building"), [openPlain]);
  const openData = useCallback(() => openPlain("data"), [openPlain]);
  const openGraphics = useCallback(() => openPlain("graphics"), [openPlain]);
  const openSite = useCallback(() => openPlain("site"), [openPlain]);
  const closeLeft = useCallback(() => {
    setCatalog(false);
    setLeft(null);
  }, [setCatalog]);
  const toggle = (isOpen: boolean, open: () => void) => (isOpen ? setLeft(null) : open());

  return {
    left, setLeft, browser, climate, plex, building, newPlan, data, graphics, site, mapRoom,
    openBrowser, openClimate, openPlex, openBuilding, openData, openGraphics, openSite,
    toggleBrowser: () => toggle(!!browser, openBrowser),
    toggleClimate: () => toggle(!!climate, openClimate),
    togglePlex: () => toggle(!!plex, openPlex),
    toggleBuilding: () => toggle(!!building, openBuilding),
    toggleNewPlan: () => toggle(!!newPlan, () => openPlain("newplan")),
    toggleData: () => toggle(!!data, openData),
    toggleGraphics: () => toggle(!!graphics, openGraphics),
    toggleSite: () => toggle(!!site, openSite),
    onAreas: () => {
      const { sel, plan } = useStore.getState();
      openBrowser("", sel?.type === "room" ? sel.id : plan.rooms.find((r) => !r.parent)?.id);
    },
    closeLeft,
  };
}
