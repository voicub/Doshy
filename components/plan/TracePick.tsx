"use client";
import { ImageSquareIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import type { Trace } from "@/lib/designTypes";
import { PDF_MESSAGE } from "@/lib/traceUpload";
import { Block } from "../ui/SiteBits";
import { importTraceFile, traceUrl } from "./traceImage";
import { putTrace } from "./traceEdit";
import { traceView, useTraceUi } from "./traceUi";

export type Importer = {
  busy: boolean;
  message: string | null;
  /** Opens the file dialog. */
  browse: () => void;
  /** The hidden file input: render it once. */
  input: ReactNode;
  /** Drag and drop onto whatever these spread on. */
  drop: { onDragOver: (e: DragEvent) => void; onDragLeave: () => void; onDrop: (e: DragEvent) => void };
  over: boolean;
};

/** Choosing a picture, by the file dialog (a phone offers its camera too) or by dropping a file: decode, store, and set it as the plan's image in one undo step. */
export function useTraceImport(): Importer {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const working = useRef(false);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const choose = async (f: File | undefined) => {
    if (!f || working.current) return;
    working.current = true;
    setBusy(true);
    setMessage(null);
    const got = await importTraceFile(f, traceView.rect);
    working.current = false;
    if (!alive.current) return; // the panel was closed meanwhile: the picture stays stored, the plan stays as it was
    setBusy(false);
    if (!got.ok) return setMessage(got.message);
    const ui = useTraceUi.getState();
    ui.clearSuggestions();
    ui.stopCalib();
    putTrace(got.trace);
  };
  const drop = {
    onDragOver: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes("Files")) return;
      e.preventDefault(); // allows the drop
      setOver(true);
    },
    onDragLeave: () => setOver(false),
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      setOver(false);
      void choose(e.dataTransfer.files[0]);
    },
  };
  const input = <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; void choose(f); }} />;
  return { busy, message, browse: () => file.current?.click(), input, drop, over };
}

const Status = ({ i }: { i: Importer }) => (
  <>
    {i.busy && <p className="field-note" role="status">Preparing the picture...</p>}
    {i.message && <p className="field-note warn" role="alert">{i.message}</p>}
  </>
);

/** The first step, before there is a picture: choose one. */
export function PickBlock({ i }: { i: Importer }) {
  return (
    <Block title="Choose a picture" name="pick">
      <p className="hint">Put a photo, scan or drawing of a floor plan under your plan, set its size, then trace the walls over it.</p>
      <button type="button" className={`tr-drop ${i.over ? "over" : ""}`} disabled={i.busy} onClick={i.browse}>
        <ImageSquareIcon size={28} aria-hidden />
        <span>{i.busy ? "Preparing the picture..." : "Choose a picture, or drop one here"}</span>
        <small>PNG, JPG, WebP, GIF or SVG. On a phone you can take a photo.</small>
      </button>
      <p className="field-note">{PDF_MESSAGE}</p>
      {i.message && <p className="field-note warn" role="alert">{i.message}</p>}
    </Block>
  );
}

/** Once there is a picture: how it looks, and choosing another. */
export function PictureBlock({ t, i }: { t: Trace; i: Importer }) {
  return (
    <Block title="Picture" name="picture">
      <div className="tr-pic">
        <img className="tr-thumb" src={traceUrl(t.resourceId)} alt="The floor plan picture" draggable={false} />
        <p className="field-note">{t.w} x {t.h} px. A copy is kept on the server, so the plan keeps its picture.</p>
      </div>
      <button type="button" className="btn sp-wide" disabled={i.busy} onClick={i.browse}>Choose another picture</button>
      <Status i={i} />
    </Block>
  );
}
