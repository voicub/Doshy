"use client";
import { ArrowCounterClockwiseIcon, FolderOpenIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import type { CustomPiece } from "@/lib/customCatalog";
import { useCustom } from "@/lib/customStore";
import { errorMessage } from "@/lib/guards";
import type { PackResult } from "@/lib/pieceShare";
import { findConflicts, packTag, planImport, type Choice, type ModelState } from "@/lib/pieceShareMerge";
import { applyImport, modelStates, readPackFile, type Added } from "./packApply";
import SharePackPreview from "./SharePackPreview";
import "./sharePacks.css";

type Ok = Extract<PackResult, { ok: true }>;
type Step =
  | { t: "pick"; problem?: string }
  | { t: "reading" }
  | { t: "preview"; read: Ok; stored: ReadonlyMap<string, ModelState>; at: number }
  | { t: "done"; text: string; added: Added | null };

const plural = (n: number) => `${n} piece${n === 1 ? "" : "s"}`;

type Preview = Extract<Step, { t: "preview" }>;
const planFor = (p: Preview, mine: readonly CustomPiece[], choices: ReadonlyMap<string, Choice>) =>
  planImport(mine, p.read.pack.pieces, choices, { tag: packTag(p.read.info, p.at), models: p.read.pack.models, stored: p.stored });

/** "Import a pack": choose a file, see what it holds, decide what happens to pieces that clash with yours, add them (and undo that). */
export default function SharePackImport() {
  const [step, setStep] = useState<Step>({ t: "pick" });
  const [choices, setChoices] = useState<ReadonlyMap<string, Choice>>(new Map());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const open = useRef<Added | null>(null); // the import that can still be undone: made final when the page goes away or another file is chosen
  const pieces = useCustom((s) => s.pieces);

  useEffect(() => () => open.current?.commit(), []);

  const reset = (next: Step) => {
    open.current?.commit();
    open.current = null;
    setChoices(new Map());
    setError(null);
    setStep(next);
  };

  const choose = async (file: File | undefined) => {
    if (!file) return;
    reset({ t: "reading" });
    try {
      const read = await readPackFile(file);
      if (!read.ok) return setStep({ t: "pick", problem: read.reason });
      setStep({ t: "preview", read, stored: await modelStates(read.pack.models), at: Date.now() });
    } catch (e) {
      setStep({ t: "pick", problem: `This file could not be read: ${errorMessage(e)}` });
    }
  };
  const drop = (e: DragEvent) => {
    e.preventDefault();
    void choose(e.dataTransfer.files[0]);
  };

  const preview = step.t === "preview" ? step : null;
  const conflicts = useMemo(() => (preview ? findConflicts(pieces, preview.read.pack.pieces) : []), [preview, pieces]);
  const plan = useMemo(
    () => (preview ? planFor(preview, pieces, choices) : null),
    [preview, pieces, choices],
  );
  const total = plan ? plan.add.length + plan.replace.length : 0;

  const add = async () => {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const added = await applyImport(planFor(preview, pieces, choices));
      open.current = added;
      setStep({ t: "done", added, text: `Added ${plural(added.count)} from ${preview.read.info.name}.` });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const undo = () => {
    open.current?.undo();
    open.current = null;
    setStep({ t: "done", added: null, text: "Undone. Those pieces were taken out of My pieces again." });
  };

  return (
    <div className="shr-section shp" onDragOver={(e) => e.preventDefault()} onDrop={drop}>
      <input ref={input} type="file" accept=".doshypack,.json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; void choose(f); }} />

      {(step.t === "pick" || step.t === "reading") && (
        <>
          <p className="field-note">Choose a .doshypack file someone sent you. You will see what is in it before anything is added.</p>
          <div className="shr-actions">
            <button type="button" className="btn primary" disabled={step.t === "reading"} onClick={() => input.current?.click()}>
              <FolderOpenIcon size={14} /> {step.t === "reading" ? "Reading..." : "Choose a pack file..."}
            </button>
          </div>
          {step.t === "pick" && step.problem && (
            <p className="field-note warn" role="alert">
              {step.problem}
            </p>
          )}
        </>
      )}

      {preview && plan && (
        <>
          <SharePackPreview
            read={preview.read}
            conflicts={conflicts}
            choices={choices}
            onChoice={(kind, c) => setChoices((m) => new Map(m).set(kind, c))}
            onAll={(c) => setChoices(new Map(conflicts.map((x) => [x.piece.kind, c])))}
          />
          <div className="shr-actions">
            <button type="button" className="btn primary" disabled={busy || total === 0} onClick={() => void add()}>
              {busy ? "Adding..." : total ? `Add ${plural(total)}` : "Nothing to add"}
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => reset({ t: "pick" })}>
              Cancel
            </button>
          </div>
          {error && (
            <p className="field-note warn" role="alert">
              {error}
            </p>
          )}
        </>
      )}

      {step.t === "done" && (
        <>
          <p className="field-note ok" role="status">
            {step.text}
          </p>
          <div className="shr-actions">
            {step.added && (
              <button type="button" className="btn" onClick={undo}>
                <ArrowCounterClockwiseIcon size={14} /> Undo
              </button>
            )}
            <button type="button" className="btn" onClick={() => reset({ t: "pick" })}>
              Add another pack
            </button>
          </div>
        </>
      )}
    </div>
  );
}
