"use client";
import { useMemo, useState } from "react";
import { useCarModels } from "@/lib/carModelStore";
import { creditsOf, LICENSE_SHORT } from "@/lib/carModels";
import { CATALOG } from "@/lib/catalog";
import PieceDialog from "./PieceDialog";
import "./carModelFinder.css";

/**
 * Who made the real 3D car models this app shows, under which licence, and where they come from. The Creative Commons licences require this
 * to stay visible wherever the model is used; the app never bundles the models, each user downloads their own from Sketchfab.
 */
export default function CarCredits({ onClose }: { onClose: () => void }) {
  const models = useCarModels((s) => s.models);
  const list = useMemo(() => creditsOf(models), [models]);
  return (
    <PieceDialog title="Credits for 3D models" onClose={onClose}>
      <div className="pd-scroll">
        <p className="cmc-note">
          Real car models come from <a href="https://sketchfab.com" target="_blank" rel="noopener noreferrer">Sketchfab</a>. They are not part of this app: each one was downloaded with your own Sketchfab account, under a Creative Commons licence that allows reuse
          (CC0, CC BY or CC BY-SA), and is kept only on your device. The author must be credited, so keep this list with any picture or plan you share.
        </p>
        {list.length === 0 ? (
          <p className="field-note">No real car models are in use. Open a car, then press &ldquo;Make this car look exact&rdquo;.</p>
        ) : (
          <ul className="cmc-list">
            {list.map(({ attribution: a, carIds }) => (
              <li key={a.uid}>
                <strong>{a.name}</strong>
                <span>
                  by {a.authorUrl ? <a href={a.authorUrl} target="_blank" rel="noopener noreferrer">{a.author}</a> : a.author}
                  {" · "}
                  <a href={a.licenseUrl || undefined} target="_blank" rel="noopener noreferrer">{LICENSE_SHORT[a.license]}</a>
                  {" · "}
                  <a href={a.sourceUrl} target="_blank" rel="noopener noreferrer">Source on Sketchfab</a>
                </span>
                <span>Used for: {carIds.map((id) => CATALOG[id]?.label ?? id).join(", ")}</span>
                <span>{a.line}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <footer className="pb-foot">
        <button type="button" className="btn" onClick={onClose}>Close</button>
      </footer>
    </PieceDialog>
  );
}

/** "3D model credits" link for the catalog drawer; shown only while some real car model is in use. */
export function CreditsLink() {
  const count = useCarModels((s) => Object.keys(s.models).length);
  const [open, setOpen] = useState(false);
  if (!count) return null;
  return (
    <>
      <button type="button" className="cmf-credits-link" onClick={() => setOpen(true)}>3D model credits</button>
      {open && <CarCredits onClose={() => setOpen(false)} />}
    </>
  );
}
