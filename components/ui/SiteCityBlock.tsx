"use client";
import { ArrowsClockwiseIcon, FileArrowUpIcon } from "@phosphor-icons/react";
import { useRef, useState, type ChangeEvent } from "react";
import { importCityFile } from "@/lib/siteCityImport";
import { placeProblem } from "@/lib/siteCityState";
import { useCityState } from "@/lib/siteCityStore";
import { CITY_TILES, DEFAULT_CITY } from "@/lib/siteCityTypes";
import type { Site } from "@/lib/siteTypes";
import { parseNumber } from "@/lib/siteUi";
import { useStore } from "@/lib/store";
import MonoLabel from "./MonoLabel";
import { Block, Switch } from "./SiteBits";

const KM = { 3: "about 1.3 km across", 5: "about 2.2 km across" } as const;

/** What is happening with the city model, in plain words. */
function CityStatus({ fromFile }: { fromFile: boolean }) {
  const { status, error, stats, loaded } = useCityState();
  const refresh = useCityState((s) => s.refresh);
  if (status === "error") {
    return (
      <>
        <p className="sp-status bad" role="alert">{error}</p>
        <p className="field-note">The OpenStreetMap buildings and roads are shown meanwhile.</p>
        <button type="button" className="btn sp-wide" onClick={() => void refresh()}><ArrowsClockwiseIcon size={16} aria-hidden /> Try again</button>
      </>
    );
  }
  if (status === "loading") return <p className="sp-status" role="status">Loading the city model...{!fromFile && <small>The first time, the server fetches the map tiles from Nextzen: this can take a minute.</small>}</p>;
  if (status === "ready" && loaded) {
    return (
      <p className="sp-status" role="status">
        {stats ? `${stats.buildings} buildings${stats.roadTriangles ? " and roads" : ""} drawn` : "The city model is loaded. It is drawn in Live mode (Garden)."}
        {stats && stats.leftOut > 0 && <small>{stats.leftOut} more were left out: too far, too small or beyond what this device draws smoothly.</small>}
      </p>
    );
  }
  return null;
}

/** The tile numbers an imported model needs: where on Earth it is. */
function ImportForm({ file, onDone }: { file: File; onDone: () => void }) {
  const setSite = useStore((s) => s.setSite);
  const [zoom, setZoom] = useState("16");
  const [known, setKnown] = useState(false);
  const [tx, setTx] = useState("");
  const [ty, setTy] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const z = parseNumber(zoom);
  const x = known ? parseNumber(tx) : null;
  const y = known ? parseNumber(ty) : null;
  const bad = placeProblem(z, x, y) ?? (known && (x === null || y === null) ? "Give both tile numbers, or switch the option off." : undefined);

  const add = async () => {
    if (bad || z === null) return;
    setBusy(true);
    setError(undefined);
    try {
      const place = x !== null && y !== null ? { z, x, y } : { z };
      const stored = await importCityFile(file, place);
      setSite({ buildingsFrom: "city", city: { file: stored } });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The city model could not be imported.");
      setBusy(false);
    }
  };

  return (
    <div className="sp-import">
      <p className="sp-status">{file.name}<small>{(file.size / 1048576).toFixed(1)} MB</small></p>
      <label className="field">
        <MonoLabel>Zoom (the tilez you gave Vectiler)</MonoLabel>
        <input inputMode="numeric" value={zoom} onChange={(e) => setZoom(e.target.value)} aria-invalid={z === null} />
      </label>
      <Switch on={known} label="I know which map tiles it covers" onChange={setKnown} />
      {known ? (
        <div className="sp-coords">
          <label className="field"><MonoLabel>Tile x of the first tile</MonoLabel><input inputMode="numeric" value={tx} onChange={(e) => setTx(e.target.value)} /></label>
          <label className="field"><MonoLabel>Tile y of the first tile</MonoLabel><input inputMode="numeric" value={ty} onChange={(e) => setTy(e.target.value)} /></label>
          <p className="field-note">The first tile is the top-left one of the range you gave Vectiler (the first of --tilex and --tiley).</p>
        </div>
      ) : (
        <p className="field-note">Otherwise the middle of the model is put on your home. Use the arrows and Drag the map to line it up.</p>
      )}
      {(bad || error) && <p className="field-note warn" role="alert">{error ?? bad}</p>}
      <div className="sp-two">
        <button type="button" className="btn" onClick={onDone} disabled={busy}>Cancel</button>
        <button type="button" className="btn on" onClick={() => void add()} disabled={busy || !!bad}>{busy ? "Importing..." : "Use this file"}</button>
      </div>
    </div>
  );
}

/** "Buildings and roads from": OpenStreetMap (the default) or the city model (Vectiler on this server, or a file the owner imported). */
export default function CityBlock({ site }: { site: Site }) {
  const setSite = useStore((s) => s.setSite);
  const [picked, setPicked] = useState<File>();
  const input = useRef<HTMLInputElement>(null);
  const city = site.city ?? DEFAULT_CITY;
  const on = site.buildingsFrom === "city";
  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    setPicked(e.target.files?.[0]);
    e.target.value = ""; // choosing the same file again must fire again
  };

  return (
    <Block title="Buildings and roads from" name="city">
      <div className="seg sp-seg sp-seg2" role="group" aria-label="Where the buildings and roads come from">
        <button type="button" aria-pressed={!on} onClick={() => setSite({ buildingsFrom: "osm" })}>OpenStreetMap<small>the usual</small></button>
        <button type="button" aria-pressed={on} onClick={() => setSite({ buildingsFrom: "city" })}>City model<small>Vectiler</small></button>
      </div>
      {!on && <p className="field-note">Buildings and roads as map volunteers drew them. The city model is a 3D model from Nextzen's map tiles: it has real building heights in many cities.</p>}
      {on && (
        <>
          <CityStatus fromFile={!!city.file} />
          {city.file ? (
            <>
              <p className="sp-status">Using your file: {city.file.name}<small>It stays under Data and backups until you delete it there.</small></p>
              <button type="button" className="btn sp-wide" onClick={() => setSite({ city: { file: undefined } })}>Ask Nextzen instead</button>
            </>
          ) : (
            <>
              <MonoLabel>Choose the area size</MonoLabel>
              <div className="seg sp-seg sp-seg2" role="group" aria-label="Area size">
                {CITY_TILES.map((n) => (
                  <button key={n} type="button" aria-pressed={city.tiles === n} onClick={() => setSite({ city: { tiles: n } })}>{n} x {n} tiles<small>{KM[n]}</small></button>
                ))}
              </div>
            </>
          )}
          <Switch on={city.roads} label="Include roads" onChange={(roads) => setSite({ city: { roads } })} />
          <Switch on={city.terrain} label="Ground shape from the city model" onChange={(terrain) => setSite({ city: { terrain } })} />
          <p className="field-note">The ground shape setting only counts with the ground height layer on. Roads and buildings follow the "What to show" chips too.</p>
          {!city.file && <p className="field-note">Needs a free Nextzen key and the Vectiler tool on the server. Tile positions around your home, rounded, are sent to Nextzen.</p>}
          <details className="sp-adv">
            <summary>How to set it up</summary>
            <ol className="sp-steps">
              <li>Get a free key at developers.nextzen.org.</li>
              <li>Docker or Home Assistant add-on: set NEXTZEN_API_KEY (the add-on has an option for it). The image already contains the tool.</li>
              <li>Running from source: build Vectiler once (five commands in docs/site.md), set VECTILER_PATH to it, and put NEXTZEN_API_KEY in .env.local.</li>
              <li>Or make a model yourself with Vectiler or halfmaps.io and import the .obj below.</li>
            </ol>
          </details>
        </>
      )}
      {picked ? (
        <ImportForm file={picked} onDone={() => setPicked(undefined)} />
      ) : (
        <>
          <button type="button" className="btn sp-wide" onClick={() => input.current?.click()}><FileArrowUpIcon size={16} aria-hidden /> Import a city model (.obj)</button>
          <input ref={input} type="file" accept=".obj,text/plain,model/obj" hidden onChange={onFile} aria-label="Choose a city model file" />
        </>
      )}
    </Block>
  );
}
