"use client";
import { DownloadSimpleIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { useCustom } from "@/lib/customStore";
import { errorMessage } from "@/lib/guards";
import { estimatePackBytes, exportProblem, sizeLabel } from "@/lib/pieceShare";
import { packCredit } from "@/lib/polyhavenPiece";
import { downloadPack, makePack } from "./packApply";
import PackThumb from "./PackThumb";
import "./sharePacks.css";

const plural = (n: number) => `${n} piece${n === 1 ? "" : "s"}`;

/** "Export my pieces": tick the pieces to put in the pack, give it a name, save a .doshypack file. */
export default function SharePackExport() {
  const pieces = useCustom((s) => s.pieces);
  const [off, setOff] = useState<ReadonlySet<string>>(new Set()); // what is NOT ticked: new pieces start ticked
  const [name, setName] = useState("My furniture");
  const [author, setAuthor] = useState("");
  const [licence, setLicence] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; bad?: boolean } | null>(null);

  const chosen = useMemo(() => pieces.filter((p) => !off.has(p.kind)), [pieces, off]);
  const size = useMemo(() => estimatePackBytes(chosen), [chosen]);
  const problem = exportProblem(chosen, size);
  const all = chosen.length === pieces.length;

  const toggle = (kind: string) => {
    setNote(null);
    setOff((s) => {
      const next = new Set(s);
      if (!next.delete(kind)) next.add(kind);
      return next;
    });
  };
  const toggleAll = () => {
    setNote(null);
    setOff(all ? new Set(pieces.map((p) => p.kind)) : new Set());
  };

  const save = async () => {
    setBusy(true);
    setNote(null);
    try {
      const credit = packCredit(chosen, { author, licence });
      const made = await makePack({ name, ...credit }, chosen);
      if (!made.ok) return setNote({ text: made.reason, bad: true });
      const file = downloadPack(made.text, name);
      setNote({ text: `Saved ${file} (${sizeLabel(made.bytes)}, ${plural(chosen.length)}).` });
    } catch (e) {
      setNote({ text: `The pack could not be saved: ${errorMessage(e)}`, bad: true });
    } finally {
      setBusy(false);
    }
  };

  if (!pieces.length) {
    return <p className="field-note">You have not made any pieces yet. Open the catalog, go to My pieces, and build a piece or import a 3D model. Then come back here to share them.</p>;
  }

  return (
    <div className="shr-section shp">
      <label className="field">
        <span className="label">Pack name</span>
        <input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} aria-label="Pack name" />
      </label>

      <div className="shp-bar">
        <label className="shp-check">
          <input type="checkbox" checked={all} onChange={toggleAll} />
          <span>{all ? "All pieces" : "Choose all"}</span>
        </label>
        <span className="label">{chosen.length} of {pieces.length} chosen</span>
      </div>
      <ul className="shp-grid" aria-label="Pieces to put in the pack">
        {pieces.map((p) => (
          <li key={p.kind}>
            <label className="shp-card" data-on={!off.has(p.kind)}>
              <input type="checkbox" className="shp-tick" checked={!off.has(p.kind)} onChange={() => toggle(p.kind)} />
              <PackThumb piece={p} />
              <span className="shp-name">{p.name}</span>
              <span className="shp-sub">{p.model ? "3D model" : "Shapes"}</span>
            </label>
          </li>
        ))}
      </ul>

      <details className="shr-adv">
        <summary>Author and licence (optional)</summary>
        <label className="field">
          <span className="label">Made by</span>
          <input value={author} maxLength={120} onChange={(e) => setAuthor(e.target.value)} placeholder="Your name" aria-label="Made by" />
        </label>
        <label className="field">
          <span className="label">Licence note</span>
          <input value={licence} maxLength={120} onChange={(e) => setLicence(e.target.value)} placeholder="For example: free to use, please credit me" aria-label="Licence note" />
        </label>
        <p className="field-note">The licence is only a note that travels with the file. Doshy does not enforce it and it is not legal advice.</p>
      </details>

      <p className={`field-note${problem ? " warn" : ""}`} role="status">
        {problem ?? `This pack will be about ${sizeLabel(size)}.`}
      </p>
      <div className="shr-actions">
        <button type="button" className="btn primary" disabled={!!problem || busy || !name.trim()} onClick={() => void save()}>
          <DownloadSimpleIcon size={14} /> {busy ? "Saving..." : "Save pack"}
        </button>
      </div>
      {note && (
        <p className={`field-note${note.bad ? " warn" : " ok"}`} role="status">
          {note.text}
        </p>
      )}
    </div>
  );
}
