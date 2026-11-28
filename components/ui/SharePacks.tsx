"use client";
import { DownloadSimpleIcon, UploadSimpleIcon } from "@phosphor-icons/react";
import { useState } from "react";
import SharePackExport from "./SharePackExport";
import SharePackImport from "./SharePackImport";
import SharePackList from "./SharePackList";
import "./sharePacks.css";

type View = "home" | "export" | "import";

/** Share > My pieces: pack your own furniture into one file, or add a pack from someone else, and manage the packs you added. */
export default function SharePacks() {
  const [view, setView] = useState<View>("home");

  if (view !== "home") {
    return (
      <>
        <button type="button" className="shr-back shp-back" onClick={() => setView("home")}>
          Back to my pieces
        </button>
        {view === "export" ? <SharePackExport /> : <SharePackImport />}
      </>
    );
  }
  return (
    <>
      <ul className="shr-menu">
        <li>
          <button type="button" className="shr-row" onClick={() => setView("export")}>
            <span className="shr-ico" aria-hidden><DownloadSimpleIcon size={18} /></span>
            <span className="shr-text">
              <b>Export my pieces...</b>
              <small>Choose pieces and save them as one file</small>
            </span>
          </button>
        </li>
        <li>
          <button type="button" className="shr-row" onClick={() => setView("import")}>
            <span className="shr-ico" aria-hidden><UploadSimpleIcon size={18} /></span>
            <span className="shr-text">
              <b>Import a pack...</b>
              <small>Add the pieces from a .doshypack file</small>
            </span>
          </button>
        </li>
      </ul>
      <SharePackList />
    </>
  );
}
