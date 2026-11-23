"use client";
import { ArrowClockwiseIcon, ArrowDownIcon, ArrowSquareOutIcon, ArrowsLeftRightIcon, ArrowUpIcon, MagnifyingGlassIcon, MinusIcon, PlusIcon, WarningIcon } from "@phosphor-icons/react";
import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { BoxGeometry, EdgesGeometry } from "three";
import type { FinderError } from "@/lib/carImport";
import { useCarModels } from "@/lib/carModelStore";
import { fitModel, LICENSE_SHORT, nudge, type CarModelEntry } from "@/lib/carModels";
import { measureTemplate } from "@/lib/carTemplate";
import type { CarSpec } from "@/lib/cars";
import type { SearchHit } from "@/lib/modelLibrary";
import { AutoButton, AutoStatus, TokenCard } from "./CarAuto";
import CarModelMesh, { useRealTemplate } from "./scene/CarModelMesh";
import { Studio } from "./scene/PostFx";
import PieceDialog from "./PieceDialog";
import { useCarFinder, type CarFinder } from "./useCarFinder";
import "./carModelFinder.css";

const mb = (n: number) => `${Math.max(1, Math.round(n / 1024 / 1024))} MB`;
const faces = (n: number) => (n >= 10000 ? `${Math.round(n / 1000)}k` : String(n)) + " triangles";
const NUDGE = { up: 0.02, scale: 0.02 };
const PLATE = { text: "", style: "eu" as const };

function ErrorNote({ err }: { err: FinderError | null }) {
  if (!err) return null;
  return (
    <div className="cmf-err" role="alert">
      <p>{err.message}</p>
      {err.steps && (
        <ol>
          {err.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** The car as it will look in the plan, with the published footprint drawn around it and an arrow where the front should be. */
function Preview({ spec, entry }: { spec: CarSpec; entry: CarModelEntry }) {
  const level = useRef(0);
  const box = useMemo(() => new EdgesGeometry(new BoxGeometry(spec.width, spec.height, spec.length)), [spec]);
  useEffect(() => () => box.dispose(), [box]);
  return (
    <>
      <Studio />
      <hemisphereLight args={["#ffffff", "#556070", 0.9]} />
      <directionalLight position={[3, 6, 4]} intensity={2.2} />
      <CarModelMesh spec={spec} entry={entry} finish="gloss" level={level} ghost={false} plate={PLATE} />
      <lineSegments geometry={box} position={[0, spec.height / 2, 0]}>
        <lineBasicMaterial color="#5ad7ff" transparent opacity={0.55} />
      </lineSegments>
      <mesh position={[0, 0.02, spec.length / 2 + 0.45]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.16, 0.4, 16]} />
        <meshBasicMaterial color="#5ad7ff" />
      </mesh>
      <gridHelper args={[10, 20, "#1e3a47", "#12232b"]} />
      <OrbitControls makeDefault enablePan={false} target={[0, spec.height / 2, 0]} minDistance={3} maxDistance={14} maxPolarAngle={Math.PI / 2 - 0.02} />
    </>
  );
}

/** Step 3: is it the right way round, on the ground and the right size? Big buttons; the car updates at once. */
function Fit({ spec, entry, onChange, onSave, onBack }: { spec: CarSpec; entry: CarModelEntry; onChange: (e: CarModelEntry) => void; onSave: () => void; onBack: () => void }) {
  const { tpl } = useRealTemplate(entry.resource);
  const measure = useMemo(() => (tpl ? measureTemplate(tpl) : null), [tpl]);
  const differs = measure ? fitModel(measure, entry.calib, { w: spec.width, d: spec.length, h: spec.height }).differs : false;
  const set = (c: Partial<CarModelEntry["calib"]>) => onChange({ ...entry, calib: nudge(entry.calib, c) });
  const c = entry.calib;
  return (
    <>
      <div className="cmf-fit">
        <div className="cmf-preview">
          <Canvas frameloop="demand" dpr={[1, 2]} camera={{ position: [5.2, 2.6, 5.4], fov: 32 }} aria-label="3D preview of the car" gl={{ antialias: true }}>
            <Preview spec={spec} entry={entry} />
          </Canvas>
        </div>
        <div className="cmf-side">
          <p className="cmf-help">The car should stand on the grid with its front toward the blue arrow, inside the blue box (the real size of a {spec.label}).</p>
          <div className="cmf-btns" role="group" aria-label="Turn and place the car">
            <button type="button" className="btn cmf-big" onClick={() => set({ rotY: c.rotY + 1 })}><ArrowClockwiseIcon size={16} />Rotate 90°</button>
            <button type="button" className="btn cmf-big" onClick={() => set({ flip: !c.flip })}><ArrowsLeftRightIcon size={16} />Flip front / back</button>
            <button type="button" className="btn cmf-big" onClick={() => set({ yOffset: c.yOffset + NUDGE.up })}><ArrowUpIcon size={16} />Move up</button>
            <button type="button" className="btn cmf-big" onClick={() => set({ yOffset: c.yOffset - NUDGE.up })}><ArrowDownIcon size={16} />Move down</button>
            <button type="button" className="btn cmf-big" onClick={() => set({ yOffset: 0 })}>Fix ground</button>
            <button type="button" className="btn cmf-big" onClick={() => set({ scale: c.scale + NUDGE.scale })}><PlusIcon size={16} />Bigger</button>
            <button type="button" className="btn cmf-big" onClick={() => set({ scale: c.scale - NUDGE.scale })}><MinusIcon size={16} />Smaller</button>
          </div>
          {differs && (
            <p className="cmf-warn" role="status"><WarningIcon size={14} /> This looks like a different generation. It is sized to the right length, but its shape is a bit different from the real {spec.label}. You can still use it.</p>
          )}
          {!measure && tpl && <p className="cmf-warn" role="alert"><WarningIcon size={14} /> This model has no car-like shape in it.</p>}
          <p className="cmf-credit">{entry.attribution.line}</p>
        </div>
      </div>
      <footer className="pb-foot">
        <button type="button" className="btn" onClick={onBack}>Choose another</button>
        <button type="button" className="btn primary" onClick={onSave} disabled={!measure}>Use this model</button>
      </footer>
    </>
  );
}

function Card({ hit, canDownload, busy, onUse }: { hit: SearchHit; canDownload: boolean; busy: boolean; onUse: (h: SearchHit) => void }) {
  return (
    <article className="cmf-card">
      {/* remote Sketchfab thumbnails, tiny: not worth the image optimiser */}
      <img src={hit.thumb} alt={`Picture of ${hit.name}`} loading="lazy" referrerPolicy="no-referrer" width={256} height={144} />
      <h3 title={hit.name}>{hit.name}</h3>
      <p className="cmf-by">by <a href={hit.authorUrl} target="_blank" rel="noopener noreferrer">{hit.author}</a></p>
      <p className="cmf-badges">
        <span className="cmf-lic" title={hit.license.label}>{LICENSE_SHORT[hit.license.slug]}</span>
        <span>{faces(hit.faces)}</span>
        {hit.glbBytes ? <span>{mb(hit.glbBytes)}</span> : null}
      </p>
      <div className="cmf-card-act">
        <button type="button" className="btn primary" disabled={busy} title={canDownload ? undefined : "Needs a Sketchfab token (see the steps above)"} onClick={() => onUse(hit)}>Use this model</button>
        <a className="btn" href={hit.url} target="_blank" rel="noopener noreferrer" aria-label={`View ${hit.name} on Sketchfab`}><ArrowSquareOutIcon size={14} />View</a>
      </div>
    </article>
  );
}

/** Step 1: search real models by name, or paste a Sketchfab link. */
function FinderSearch({ spec, finder, onClose }: { spec: CarSpec; finder: CarFinder; onClose: () => void }) {
  const current = useCarModels((s) => s.models[spec.id]);
  const { words, err, search: s, fullDetail, setFullDetail, use } = finder;
  return (
    <>
      <div className="pd-scroll">
        <form
          className="cmf-search"
          onSubmit={(e) => {
            e.preventDefault();
            const link = s.q.match(/[a-f0-9]{32}/i); // a pasted Sketchfab link (or model id) goes straight to download
            if (link) void use({ uid: link[0].toLowerCase() });
            else void s.search(s.q.trim());
          }}
        >
          <label className="field cmf-q">
            <span className="label">Search real 3D models, or paste a Sketchfab link</span>
            <input enterKeyHint="search" value={s.q} maxLength={200} onChange={(e) => s.setQ(e.target.value)} placeholder="Brand model year" />
          </label>
          <button type="submit" className="btn primary" disabled={s.searching || s.q.trim().length < 2}><MagnifyingGlassIcon size={14} />Search</button>
        </form>
        <AutoButton carId={spec.id} hasModel={!!current} />
        <AutoStatus carId={spec.id} />
        <div className="cmf-opts">
          {words.alternatives.length > 0 && <span className="label">Also try</span>}
          {words.alternatives.map((a) => (
            <button key={a} type="button" className="pb-chip" onClick={() => { s.setQ(a); void s.search(a); }}>{a}</button>
          ))}
          <label className="cmf-check">
            <input type="checkbox" checked={s.heavy} onChange={(e) => s.setHeavy(e.target.checked)} /> Allow heavy models (over 200 000 triangles, slower to prepare)
          </label>
          <label className="cmf-check">
            <input type="checkbox" checked={fullDetail} onChange={(e) => setFullDetail(e.target.checked)} /> Keep every detail (no simplifying: sharper, but a big file and a slower scene)
          </label>
        </div>
        {!s.canDownload && <TokenCard onFound={() => s.setCanDownload(true)} />}
        <ErrorNote err={err} />
        <div className="cmf-results" aria-busy={s.searching}>
          {s.hits.map((h) => (
            <Card key={h.uid} hit={h} canDownload={s.canDownload} busy={s.searching} onUse={(x) => void use(x)} />
          ))}
          {s.searching && <p className="field-note" role="status">Searching...</p>}
          {!s.searching && s.searched && s.hits.length === 0 && !err && <p className="field-note" role="status">No reusable models found. Try a shorter search, or one of the other names above.</p>}
          {!s.searching && s.next && <button type="button" className="btn" onClick={() => void s.search(s.q.trim(), true)}>Show more</button>}
        </div>
      </div>
      <footer className="pb-foot cmf-foot">
        <span className="field-note">Models are provided by <a href="https://sketchfab.com" target="_blank" rel="noopener noreferrer">Sketchfab</a>. Only models that may be reused are shown (CC0, CC BY, CC BY-SA). The author and licence are saved with each one and listed under Credits.</span>
        <button type="button" className="btn" onClick={onClose}>Close</button>
      </footer>
    </>
  );
}

/** Step 2: the model is downloaded, simplified and checked. */
function Working({ progress, onCancel }: { progress: CarFinder["progress"]; onCancel: () => void }) {
  const pct = Math.round(progress.f * 100);
  return (
    <div className="cmf-work" role="status">
      <p>{progress.label}...</p>
      <div className="cmf-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Preparing the model"><i style={{ width: `${pct}%` }} /></div>
      <p className="field-note">Big models take a minute: they are downloaded, simplified so the dashboard stays smooth, and checked.</p>
      <button type="button" className="btn" onClick={onCancel}>Cancel</button>
    </div>
  );
}

/**
 * "Make this car look exact": search real car models on Sketchfab (only ones that may be reused: CC0, CC BY, CC BY-SA), download one with the
 * owner's own token, optimise it, fit it to the catalogue car's real size and use it for every car of this model. The author and licence are kept with it.
 */
export default function CarModelFinder({ spec, initial, onClose }: { spec: CarSpec; initial?: CarModelEntry; onClose: () => void }) {
  const finder = useCarFinder(spec, initial, onClose);
  const { step, draft } = finder;
  return (
    <PieceDialog title={`Make this car look exact: ${spec.label}`} onClose={onClose}>
      {step === "search" && <FinderSearch spec={spec} finder={finder} onClose={onClose} />}
      {step === "working" && <Working progress={finder.progress} onCancel={finder.cancel} />}
      {step === "fit" && draft && <Fit spec={spec} entry={draft} onChange={finder.setDraft} onSave={finder.keep} onBack={finder.discard} />}
    </PieceDialog>
  );
}
