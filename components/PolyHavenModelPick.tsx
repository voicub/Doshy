"use client";
import type { PhItem } from "@/lib/polyhaven";
import { downloadAsset } from "@/lib/polyhavenClient";
import { modelDetail } from "@/lib/polyhavenPiece";
import PolyHavenBrowser from "./ui/PolyHavenBrowser";

/** "Import from Poly Haven": pick a model; its file (one .glb, textures inside) then goes through the same import form as a file from this computer. */
export default function PolyHavenModelPick({ onPicked, onClose }: { onPicked: (item: PhItem, file: File) => void; onClose: () => void }) {
  return (
    <PolyHavenBrowser
      type="models"
      title="Poly Haven models"
      pickLabel="Import this model"
      detail={modelDetail}
      onClose={onClose}
      onPick={async (item) => {
        const bytes = await downloadAsset("model", item.id);
        onPicked(item, new File([bytes], `${item.id}.glb`, { type: "model/gltf-binary" }));
      }}
    />
  );
}
