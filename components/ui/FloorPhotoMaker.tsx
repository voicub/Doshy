"use client";
import { CameraIcon, ImageIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { SCALE_RANGE_M, cropBox, scaleFromPatchCm, uvRepeat, type FloorPhoto } from "@/lib/floorPhoto";
import { buildFloorTexture, cropSquare, type Built, type Pixels } from "@/lib/floorPhotoPixels";
import FloorPhotoCrop, { type CropState } from "./FloorPhotoCrop";
import { canvasOf, keepTexture, openPicture, pixelsOf, type Picture } from "./floorPhotoImage";
import HudPanel from "./HudPanel";
import MonoLabel from "./MonoLabel";
import useRestoreFocus from "./useRestoreFocus";
import "./FloorPhotoMaker.css";

type Step = "pick" | "crop" | "look";
const STEP_NO: Record<Step, number> = { pick: 1, crop: 2, look: 3 };
const PRESET_CM = [20, 40, 60, 100] as const;
const PREVIEW_TILE_PX = 64; // each of the 3 x 3 copies in the preview
const MIN_CM = SCALE_RANGE_M.min * 100;
const MAX_CM = SCALE_RANGE_M.max * 100;

const breathe = () => new Promise<void>((resolve) => setTimeout(resolve, 0)); // lets the browser draw and answer a touch between the heavy stages

/**
 * "Use a photo of my floor": choose or take a photo, drag a square over a clean patch of floor, say how wide that patch is in real life, and the app builds a texture that
 * repeats without seams. Nothing in the plan changes until the last button: `onPhoto` gets the floor photo to put on a room (or the paint brush), `onColour` just its
 * average colour ("match the colour only"). `room` (metres) lets it say how many times the patch repeats across that room.
 */
export default function FloorPhotoMaker({ room, onPhoto, onColour, onClose }: { room?: { w: number; h: number }; onPhoto: (photo: FloorPhoto) => void; onColour: (hex: string) => void; onClose: () => void }) {
  const [step, setStep] = useState<Step>("pick");
  const [picture, setPicture] = useState<Picture | null>(null);
  const [crop, setCrop] = useState<CropState>({ cx: 0, cy: 0, zoom: 1 });
  const [patch, setPatch] = useState<Pixels | null>(null);
  const [built, setBuilt] = useState<Built | null>(null);
  const [flatten, setFlatten] = useState(true);
  const [seamless, setSeamless] = useState(true);
  const [cmText, setCmText] = useState("40");
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const preview = useRef<HTMLCanvasElement>(null);
  const pictureRef = useRef<Picture | null>(null);

  useRestoreFocus();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !e.defaultPrevented && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  useEffect(() => () => pictureRef.current?.free(), []); // the photo's pixels go with the dialog
  useEffect(() => {
    root.current?.querySelector<HTMLElement>(".fpm-body button, .fpm-body input")?.focus(); // move focus into the dialog whenever its step changes
  }, [step]);

  const choose = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // choosing the same photo again must fire again
    if (!file) return;
    setProblem(null);
    setBusy("Opening the photo...");
    try {
      const next = await openPicture(file);
      pictureRef.current?.free();
      pictureRef.current = next;
      setPicture(next);
      setCrop({ cx: next.w / 2, cy: next.h / 2, zoom: 1 });
      setPatch(null);
      setBuilt(null);
      setStep("crop");
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "This picture could not be opened.");
    } finally {
      setBusy(null);
    }
  };

  const toLook = () => {
    if (!picture) return;
    const b = cropBox(picture.w, picture.h, crop.cx, crop.cy, crop.zoom);
    setPatch(cropSquare(pixelsOf(picture), b.x, b.y, b.side));
    setBuilt(null);
    setStep("look");
  };

  // the texture is built from the patch and re-built when an option changes; a slower, older build never overwrites a newer one
  useEffect(() => {
    if (step !== "look" || !patch) return;
    let current = true;
    setBuilt(null);
    void buildFloorTexture(patch, { flatten, seamless }, breathe).then((b) => current && setBuilt(b));
    return () => {
      current = false;
    };
  }, [step, patch, flatten, seamless]);

  // the preview: nine copies side by side, the way the floor will repeat it
  useEffect(() => {
    const canvas = preview.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !built) return;
    const tile = canvasOf(built.pixels);
    canvas.width = canvas.height = PREVIEW_TILE_PX * 3;
    ctx.imageSmoothingQuality = "high";
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) ctx.drawImage(tile, x * PREVIEW_TILE_PX, y * PREVIEW_TILE_PX, PREVIEW_TILE_PX, PREVIEW_TILE_PX);
    [tile.width, tile.height] = [0, 0];
  }, [built]);

  const cm = Number(cmText.replace(",", "."));
  const cmOk = cmText.trim() !== "" && Number.isFinite(cm) && cm >= MIN_CM && cm <= MAX_CM;
  const repeats = room && cmOk ? uvRepeat(room.w, room.h, scaleFromPatchCm(cm)) : null;

  const use = async () => {
    if (!built || !cmOk) return;
    setProblem(null);
    setBusy("Saving the photo...");
    const kept = await keepTexture(built, scaleFromPatchCm(cm));
    setBusy(null);
    if (!kept.ok) return setProblem(kept.message);
    onPhoto(kept.photo);
    onClose();
  };
  const colourOnly = () => {
    if (!built) return;
    onColour(built.avg);
    onClose();
  };

  return (
    <div className="fpm-scrim" ref={root} role="dialog" aria-modal="true" aria-label="Use a photo of my floor" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <HudPanel title="Floor photo" meta={`Step ${STEP_NO[step]} of 3`} onClose={onClose} className="fpm">
        <div className="fpm-body">
          {step === "pick" && (
            <>
              <p className="hint">Take or choose a photo of your real floor. The best ones are taken from straight above, in even light, with only floor in the picture: no rugs, furniture or skirting.</p>
              <div className="fpm-actions">
                <label className="btn primary fpm-file">
                  <ImageIcon size={16} aria-hidden /> Choose a photo
                  <input type="file" accept="image/*" hidden onChange={choose} />
                </label>
                <label className="btn fpm-file">
                  <CameraIcon size={16} aria-hidden /> Take a photo
                  <input type="file" accept="image/*" capture="environment" hidden onChange={choose} />
                </label>
              </div>
              <small className="field-note">The photo stays on your server. Only the small square you pick is kept.</small>
            </>
          )}
          {step === "crop" && picture && (
            <>
              <p className="hint">Drag the square over a clean patch of floor with no shadows, joins or things on it.</p>
              <FloorPhotoCrop picture={picture} crop={crop} onChange={setCrop} />
              <label className="field fpm-zoom">
                <MonoLabel>Zoom: make the square smaller or bigger</MonoLabel>
                <input type="range" min={1} max={8} step={0.05} value={crop.zoom} onChange={(e) => setCrop({ ...crop, zoom: Number(e.target.value) })} aria-label="Zoom" />
              </label>
              <div className="fpm-actions">
                <button type="button" className="btn" onClick={() => setStep("pick")}>Choose another</button>
                <button type="button" className="btn primary" onClick={toLook}>Next</button>
              </div>
            </>
          )}
          {step === "look" && (
            <>
              <div className="fpm-look">
                <div className="fpm-preview">
                  <canvas ref={preview} width={PREVIEW_TILE_PX * 3} height={PREVIEW_TILE_PX * 3} aria-label="The floor texture repeated nine times" role="img" />
                  {!built && <span className="fpm-wait">Making the floor...</span>}
                </div>
                <div className="fpm-opts">
                  <label className="field">
                    <MonoLabel>This square is about how wide in real life?</MonoLabel>
                    <span className="fpm-cm">
                      <input type="text" inputMode="decimal" value={cmText} onChange={(e) => setCmText(e.target.value)} aria-invalid={!cmOk} aria-label="Width of the square in centimetres" />
                      <i>cm</i>
                    </span>
                  </label>
                  <div className="seg" role="group" aria-label="Common widths">
                    {PRESET_CM.map((p) => (
                      <button key={p} type="button" aria-pressed={cm === p} onClick={() => setCmText(String(p))}>{p < 100 ? `${p} cm` : "1 m"}</button>
                    ))}
                  </div>
                  {!cmOk && <small className="field-note warn">Type a width between {MIN_CM} cm and {MAX_CM / 100} m.</small>}
                  {repeats && <small className="field-note">This room will show it about {Math.round(repeats.u * 10) / 10} x {Math.round(repeats.v * 10) / 10} times.</small>}
                  <label className="fpm-check"><input type="checkbox" checked={flatten} onChange={(e) => setFlatten(e.target.checked)} /> Even out the lighting</label>
                  <label className="fpm-check"><input type="checkbox" checked={seamless} onChange={(e) => setSeamless(e.target.checked)} /> Make it repeat without seams</label>
                </div>
              </div>
              <small className="field-note">A plank is about 15 cm wide and a tile 30 to 60 cm. A tape measure next to the floor makes this exact.</small>
              <div className="fpm-actions">
                <button type="button" className="btn" onClick={() => setStep("crop")}>Back</button>
                <button type="button" className="btn" disabled={!built} onClick={colourOnly}>Match the colour only</button>
                <button type="button" className="btn primary" disabled={!built || !cmOk || !!busy} onClick={() => void use()}>Use this floor</button>
              </div>
            </>
          )}
          {busy && <p className="field-note" role="status">{busy}</p>}
          {problem && <p className="field-note warn" role="alert">{problem}</p>}
        </div>
      </HudPanel>
    </div>
  );
}
