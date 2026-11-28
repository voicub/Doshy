"use client";
import { useRef } from "react";
import type { FormEvent } from "react";
import { BACKUP_URL } from "@/lib/dbApi";
import { isRecord } from "@/lib/guards";
import type { StashEntry } from "@/lib/planStash";
import { Confirm, Section, size } from "./DataBits";
import MonoLabel from "./MonoLabel";
import type { DataSnapshot } from "./useDataPanel";

const KIND_NAMES: Record<string, string> = { model: "3D model", piece: "Custom piece", image: "Image", city: "City model", material: "Poly Haven texture", hdri: "Poly Haven sky picture" };
const DELETE_TEXT: Record<string, string> = {
  model: "Delete this file? Pieces that use it will show a grey box instead.",
  piece: "Delete this piece?",
  city: "Delete this city model? The Surroundings panel will say it is missing until you import another.",
  material: "Delete this texture? Floors, walls and ground that use it fall back to their plain colour. You can download it again from Poly Haven.",
  hdri: "Delete this sky picture? Lighting that uses it needs another one. You can download it again from Poly Haven.",
};

/** " · by Rob Tuytel" for a Poly Haven file (its details carry the authors), else nothing. */
function creditOf(meta: unknown): string {
  const authors = isRecord(meta) && Array.isArray(meta.authors) ? meta.authors.filter((a): a is string => typeof a === "string" && a !== "") : [];
  return authors.length ? ` · by ${authors.join(", ")}` : "";
}

type AskProps = { off: boolean; ask: string | null; setAsk: (key: string | null) => void };

export function VersionsSection({ data, off, ask, setAsk, name, setName, onSave, onRestore }: AskProps & { data: DataSnapshot; name: string; setName: (v: string) => void; onSave: (e: FormEvent) => void; onRestore: (id: number) => void }) {
  const { info, versions } = data;
  const keep = info.keepVersions;
  const mins = Math.max(1, Math.round(info.snapshotEveryMs / 60_000));
  return (
    <Section title="Your plan">
      <form className="dp-save field" onSubmit={onSave}>
        <label htmlFor="dp-name"><MonoLabel>Name (optional)</MonoLabel></label>
        <div className="dp-inline">
          <input id="dp-name" type="text" value={name} maxLength={80} autoComplete="off" placeholder="Before the kitchen" disabled={off} onChange={(e) => setName(e.target.value)} />
          <button type="submit" className="btn" disabled={off}>Save version now</button>
        </div>
      </form>
      <p className="hint">
        The last {keep} are kept. Automatic versions are taken while you edit, at most one every {mins} {mins === 1 ? "minute" : "minutes"}.
      </p>
      <MonoLabel>Saved versions</MonoLabel>
      {versions.length === 0 ? (
        <p className="empty">No saved versions yet. They appear as you edit.</p>
      ) : (
        <ul className="dp-list" aria-label="Saved versions">
          {versions.map((v) => {
            const key = `restore:${v.id}`;
            return (
              <li key={v.id}>
                <div className="dp-row">
                  <span className="dp-text">
                    <b>{v.label || "Automatic"}</b>
                    <small><time dateTime={new Date(v.savedAt).toISOString()}>{new Date(v.savedAt).toLocaleString()}</time> · {size(v.bytes)}{v.summary ? ` · ${v.summary.items} items, ${v.summary.walls} walls, ${v.summary.rooms} rooms` : ""}</small>
                  </span>
                  <button type="button" className="btn" disabled={off} onClick={() => setAsk(key)}>Restore</button>
                </div>
                {ask === key && (
                  <Confirm label="Restore this version" text="Replace your current plan with this version? Your current plan is kept as a version too, so you can come back." yes="Restore" onYes={() => onRestore(v.id)} onNo={() => setAsk(null)} />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

export function KeptSection({ kept, off, onRestore }: { kept: StashEntry[]; off: boolean; onRestore: (e: StashEntry) => void }) {
  return (
    <Section title="Restore my previous version">
      <p className="hint">Plans this device kept before something replaced them. One click brings one back; the plan you have now is kept first. Versions saved on the server are in the list above.</p>
      {kept.length === 0 ? (
        <p className="empty">Nothing kept on this device yet.</p>
      ) : (
        <ul className="dp-list" aria-label="Plans kept on this device">
          {kept.map((e) => (
            <li key={`${e.slot}`}>
              <div className="dp-row">
                <span className="dp-text">
                  <b>{e.reason}</b>
                  <small>{e.at ? new Date(e.at).toLocaleString() : "time unknown"} · {e.items} items, {e.walls} walls, {e.rooms} rooms</small>
                </span>
                <button type="button" className="btn" disabled={off} onClick={() => onRestore(e)}>Restore</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

export function FilesSection({ files, off, ask, setAsk, onDelete }: AskProps & { files: DataSnapshot["files"]; onDelete: (r: { id: string; kind: string }) => void }) {
  return (
    <Section title="Files">
      {files.resources.length === 0 ? (
        <p className="empty">No files yet. Imported 3D models, your own pieces and textures or skies from Poly Haven appear here.</p>
      ) : (
        <ul className="dp-list" aria-label="Files">
          {files.resources.map((r) => {
            const key = `delete:${r.id}`;
            return (
              <li key={r.id}>
                <div className="dp-row">
                  <span className="dp-text">
                    <b>{r.name || r.id}</b>
                    <small>{KIND_NAMES[r.kind] ?? "File"} · {size(r.size)}{creditOf(r.meta)}</small>
                  </span>
                  <button type="button" className="btn danger" disabled={off} onClick={() => setAsk(key)} aria-label={`Delete ${r.name || r.id}`}>Delete</button>
                </div>
                {ask === key && <Confirm label="Delete this file" text={DELETE_TEXT[r.kind] ?? "Delete this file?"} yes="Delete" onYes={() => onDelete(r)} onNo={() => setAsk(null)} />}
              </li>
            );
          })}
        </ul>
      )}
      <p className="field-note">{size(files.totals.bytes)} used of {size(files.totals.limit)}</p>
    </Section>
  );
}

export function BackupSection({ off, importing, file, setFile, onImport }: { off: boolean; importing: boolean; file: File | null; setFile: (f: File | null) => void; onImport: (f: File) => void }) {
  const picker = useRef<HTMLInputElement>(null);
  return (
    <Section title="Backup">
      <p className="hint">One file with your plan, settings, versions and files. Keep it somewhere safe. The server also makes a backup every day and keeps the last 7 days.</p>
      <div className="dp-actions row">
        <a className="btn" href={BACKUP_URL} download>Download backup</a>
        <button type="button" className="btn" disabled={off} onClick={() => picker.current?.click()}>{importing ? "Importing..." : "Import backup"}</button>
        <input
          ref={picker}
          type="file"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          accept=".db,application/vnd.sqlite3,application/octet-stream"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            e.target.value = ""; // picking the same file again must still fire
          }}
        />
      </div>
      {file && (
        <Confirm label="Import backup" text="Replace everything with this backup? Your plan, settings and files will be replaced. A safety copy of what you have now is kept on the server." yes="Replace everything" onYes={() => onImport(file)} onNo={() => setFile(null)} />
      )}
    </Section>
  );
}
