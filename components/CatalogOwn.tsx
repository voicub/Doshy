"use client";
import { CopyIcon, CubeIcon, PackageIcon, ShapesIcon, UploadSimpleIcon } from "@phosphor-icons/react";
import { useRef } from "react";
import { useShareUi } from "./ui/shareUi";

type Props = {
  /** How many pieces this plan uses that are not on this device. */
  missing: number;
  onImportModel: () => void;
  onImportPolyHaven: () => void;
  onBuild: () => void;
  onCopy: () => void;
  onImportFile: (f: File) => void;
};

/** "My pieces": the three ways to add your own (import a model, build from shapes, copy and tweak) and the plan-file import. */
export default function CatalogOwn({ missing, onImportModel, onImportPolyHaven, onBuild, onCopy, onImportFile }: Props) {
  const file = useRef<HTMLInputElement>(null);
  return (
    <div className="cat-own">
      <span className="label">Add your own</span>
      <div className="cat-own-row">
        <button className="cat-own-btn" onClick={onImportModel}>
          <CubeIcon size={20} />
          <strong>Import a 3D model</strong>
          <span>.glb or .gltf file</span>
        </button>
        <button className="cat-own-btn" onClick={onBuild}>
          <ShapesIcon size={20} />
          <strong>Build from shapes</strong>
          <span>Boxes, cylinders, balls</span>
        </button>
        <button className="cat-own-btn" onClick={onCopy}>
          <CopyIcon size={20} />
          <strong>Copy and tweak</strong>
          <span>Start from any piece</span>
        </button>
      </div>
      <button className="cat-link" onClick={onImportPolyHaven}>
        <CubeIcon size={12} /> Import from Poly Haven...
      </button>
      <button className="cat-link" onClick={() => file.current?.click()}>
        <UploadSimpleIcon size={12} /> Import pieces from a plan file
      </button>
      <input ref={file} type="file" accept="application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onImportFile(f); }} />
      <button className="cat-link" onClick={() => useShareUi.getState().show("pack")}>
        <PackageIcon size={12} /> Share my pieces as a pack...
      </button>
      {missing > 0 && (
        <p className="field-note warn" role="status">
          {`This plan uses ${missing} piece${missing === 1 ? "" : "s"} that ${missing === 1 ? "is" : "are"} not on this device. They show as grey boxes until you import the plan file they came from.`}
        </p>
      )}
    </div>
  );
}
