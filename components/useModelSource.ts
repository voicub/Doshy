import { useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { cleanName, MAX_MODEL_BYTES, startSize, type CustomPiece } from "@/lib/customCatalog";
import { errorMessage } from "@/lib/guards";
import { acquireModel, disposeTemplate, parseModel, releaseModel, renderThumb, type Template } from "@/lib/modelLoad";

export type Dims = { w: number; d: number; h: number };
type Source = { tpl: Template; ext: "glb" | "gltf"; buf: ArrayBuffer | null; bytes: number };

const THUMB = { w: 256, h: 192 };
const THUMB_DELAY_MS = 200;

export type ModelSource = {
  /** The parsed model (and the file it came from, when it was picked just now). */
  src: Source | null;
  /** Reading or parsing a file. */
  busy: boolean;
  err: string | null;
  setErr: (e: string | null) => void;
  /** A file that is over the size limit. */
  big: File | null;
  setBig: (f: File | null) => void;
  name: string;
  setName: (n: string) => void;
  dims: Dims;
  setDims: Dispatch<SetStateAction<Dims>>;
  thumb: string | undefined;
  /** A template parsed here that the cache has not taken over: freed if the dialog is cancelled. */
  own: MutableRefObject<Template | null>;
  /** Read a picked or dropped file. */
  read: (f: File) => Promise<void>;
};

/** The model being imported or edited: its file, name, size and preview picture. */
export function useModelSource(piece: CustomPiece | undefined): ModelSource {
  const [src, setSrc] = useState<Source | null>(null);
  const [busy, setBusy] = useState(!!piece);
  const [err, setErr] = useState<string | null>(null);
  const [big, setBig] = useState<File | null>(null);
  const [name, setName] = useState(piece?.name ?? "");
  const [dims, setDims] = useState<Dims>(piece ? { w: piece.w, d: piece.d, h: piece.h } : { w: 1, d: 1, h: 1 });
  const [thumb, setThumb] = useState<string | undefined>(piece?.thumb);
  const own = useRef<Template | null>(null);

  useEffect(() => {
    const model = piece?.model;
    if (!model) return;
    const id = model.id;
    let live = true;
    void acquireModel(id).then((tpl) => {
      if (!live) return;
      setBusy(false);
      if (tpl) setSrc({ tpl, ext: model.ext, buf: null, bytes: model.bytes });
      else setErr("The model file for this piece is not on this device any more. You can still rename it.");
    });
    return () => {
      live = false;
      releaseModel(id);
    };
  }, [piece]);

  useEffect(
    () => () => {
      if (own.current) disposeTemplate(own.current);
    },
    [],
  );

  // the picture follows the size (a stretched model looks stretched), a moment after the last change
  useEffect(() => {
    if (!src) return;
    const t = setTimeout(() => {
      try {
        setThumb(renderThumb(src.tpl, dims, THUMB));
      } catch {
        setThumb(undefined);
      }
    }, THUMB_DELAY_MS);
    return () => clearTimeout(t);
  }, [src, dims]);

  const read = async (f: File) => {
    setErr(null);
    const ext = /\.glb$/i.test(f.name) ? "glb" : /\.gltf$/i.test(f.name) ? "gltf" : null;
    if (!ext) return setErr("Please pick a .glb or .gltf file.");
    if (f.size > MAX_MODEL_BYTES) return setBig(f);
    setBig(null);
    setBusy(true);
    try {
      const buf = await f.arrayBuffer();
      const tpl = await parseModel(buf, ext);
      if (own.current) disposeTemplate(own.current);
      own.current = tpl;
      setSrc({ tpl, ext, buf, bytes: f.size });
      setDims(startSize(tpl.size));
      setName(cleanName(f.name.replace(/\.(glb|gltf)$/i, "").replace(/[-_]+/g, " ")));
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return { src, busy, err, setErr, big, setBig, name, setName, dims, setDims, thumb, own, read };
}
