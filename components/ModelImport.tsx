"use client";
import { LockSimpleIcon, LockSimpleOpenIcon, UploadSimpleIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { cleanPiece, lockedSize, MAX_MODEL_BYTES, newKind, type CustomPiece } from "@/lib/customCatalog";
import { useCustom } from "@/lib/customStore";
import { errorMessage } from "@/lib/guards";
import { primeModel } from "@/lib/modelLoad";
import { putModel } from "@/lib/modelStore";
import { uid } from "@/lib/uid";
import PieceDialog from "./PieceDialog";
import { Step, toCm, toM } from "./PieceStep";
import { useModelSource, type Dims, type ModelSource } from "./useModelSource";

const mb = (n: number) => (n / 1024 / 1024).toFixed(1);
const fileSize = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${mb(n)} MB`);

/** The box to drop a model file on, or click to browse. */
function DropZone({ busy, onFile }: { busy: boolean; onFile: (f: File) => void }) {
  const [over, setOver] = useState(false);
  return (
    <label
      className={`pi-drop${over ? " over" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files[0];
        if (f) onFile(f);
      }}
    >
      <UploadSimpleIcon size={26} />
      <strong>{busy ? "Reading the model..." : "Choose a 3D model file"}</strong>
      <span>A .glb or .gltf file from your computer. Drop it here or click to browse. It is saved with your plan on your own Doshy server.</span>
      <input type="file" accept=".glb,.gltf,model/gltf-binary,model/gltf+json" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onFile(f); }} />
    </label>
  );
}

type FormProps = { m: ModelSource; lock: boolean; onLock: () => void };

/** The preview picture, name, sizes and the proportion lock. */
function ModelForm({ m, lock, onLock }: FormProps) {
  const { thumb, name, dims, busy } = m;
  const setDim = (key: keyof Dims, cm: number) => {
    const v = Math.max(0.01, toM(cm));
    m.setDims((d) => (lock ? lockedSize(d, key, v) : { ...d, [key]: v }));
  };
  return (
    <div className="pi-cols">
      <div className="pi-preview">
        {thumb ? <img src={thumb} alt={`Preview of ${name || "the model"}`} /> : <span className="field-note">{busy ? "" : "No preview"}</span>}
      </div>
      <div className="pi-form">
        <label className="field">
          <span className="label">Name</span>
          <input value={name} maxLength={40} onChange={(e) => m.setName(e.target.value)} placeholder="My piece" />
        </label>
        <div className="pb-grid">
          <Step label="Width" value={toCm(dims.w)} min={1} max={3000} onChange={(v) => setDim("w", v)} />
          <Step label="Depth" value={toCm(dims.d)} min={1} max={3000} onChange={(v) => setDim("d", v)} />
          <Step label="Height" value={toCm(dims.h)} min={1} max={3000} onChange={(v) => setDim("h", v)} />
        </div>
        <button type="button" className="pb-lock" aria-pressed={lock} onClick={onLock}>
          {lock ? <LockSimpleIcon size={14} /> : <LockSimpleOpenIcon size={14} />}
          {lock ? "Keeping proportions: change one size and the others follow" : "Free sizes: each side is set on its own"}
        </button>
        <p className="field-note">The model is shrunk or stretched to these sizes, centred, and put on the floor.</p>
      </div>
    </div>
  );
}

/**
 * "Import a 3D model": pick a .glb / .gltf from this computer, say how big it should be, name it, done.
 * The file is read right here in the browser and kept in this browser's storage; nothing is uploaded.
 * With `piece` it edits the name and size of a model piece imported earlier.
 */
export default function ModelImport({ piece, onClose }: { piece?: CustomPiece; onClose: (placeKind?: string) => void }) {
  const m = useModelSource(piece);
  const { src, busy, err, big, name, dims, thumb } = m;
  const [lock, setLock] = useState(true);

  const save = async () => {
    m.setErr(null);
    const store = useCustom.getState();
    if (piece) {
      const next = cleanPiece({ ...piece, name, ...dims, ...(thumb ? { thumb } : {}) });
      if (next) store.update(next);
      return onClose();
    }
    if (!src?.buf) return;
    const id = `m_${uid()}`;
    try {
      await putModel(id, { ext: src.ext, buf: src.buf }, name);
    } catch (e) {
      return m.setErr(`Could not keep the model: ${errorMessage(e)}`);
    }
    primeModel(id, src.tpl);
    m.own.current = null;
    const made = cleanPiece({ kind: newKind(name), name, ...dims, model: { id, ext: src.ext, bytes: src.bytes }, ...(thumb ? { thumb } : {}), at: Date.now() });
    if (!made) return m.setErr("Could not make a piece from this model.");
    store.add([made]);
    onClose(made.kind);
  };

  return (
    <PieceDialog title={piece ? "Edit your model" : "Import a 3D model"} onClose={() => onClose()}>
      <div className="pi-body">
        {!src && !piece && <DropZone busy={busy} onFile={(f) => void m.read(f)} />}
        {big && (
          <div className="pi-warn" role="alert">
            <p>{`That file is ${mb(big.size)} MB. Models can be at most ${mb(MAX_MODEL_BYTES)} MB: bigger ones make the dashboard slow, especially on a tablet or phone. A smaller export (fewer polygons, smaller textures) works much better.`}</p>
            <div className="pi-row">
              <button type="button" className="btn" onClick={() => m.setBig(null)}>Choose another</button>
            </div>
          </div>
        )}
        {err && <p className="field-note warn" role="alert">{err}</p>}
        {busy && (piece || src) && <p className="field-note" role="status">Reading the model...</p>}
        {(src || piece) && <ModelForm m={m} lock={lock} onLock={() => setLock((l) => !l)} />}
      </div>
      <footer className="pb-foot">
        <span className="field-note">{src ? `File ${fileSize(src.bytes)}` : ""}</span>
        <button type="button" className="btn" onClick={() => onClose()}>Cancel</button>
        <button type="button" className="btn primary" onClick={() => void save()} disabled={busy || (!src && !piece)}>{piece ? "Save changes" : "Save and place it"}</button>
      </footer>
    </PieceDialog>
  );
}
