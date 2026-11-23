"use client";
import { useRef, useState } from "react";
import { ApiError, NetError } from "@/lib/dbApi";
import { buildEverything, download, importEverything, openEverything, type Opened } from "@/lib/everythingClient";
import { FILE_EXT } from "@/lib/everything";
import MonoLabel from "./MonoLabel";

type Ready = Extract<Opened, { ok: true }>;

const say = (e: unknown) =>
  e instanceof NetError ? "The server cannot be reached." : e instanceof ApiError ? e.message : "Something went wrong. Nothing was changed.";

const size = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / (1024 * 1024)).toFixed(1)} MB`);

/** State and commands of the export / import flow. `ready` is a picked file waiting for the user's yes. */
function useEverything() {
  const [busy, setBusy] = useState<null | "export" | "import">(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [ready, setReady] = useState<Ready | null>(null);

  const exportAll = async () => {
    setBusy("export");
    setNote(null);
    try {
      const { blob, name } = await buildEverything();
      download(blob, name);
      setNote({ ok: true, text: `Saved ${name} (${size(blob.size)}). Keep it somewhere safe.` });
    } catch (e) {
      setNote({ ok: false, text: say(e) });
    }
    setBusy(null);
  };

  const pick = async (f: File) => {
    setNote(null);
    const o = await openEverything(f);
    if (o.ok) setReady(o);
    else setNote({ ok: false, text: o.error });
  };

  const doImport = async (o: Ready) => {
    setReady(null);
    setBusy("import");
    try {
      await importEverything(o); // reloads the page when it worked
    } catch (e) {
      setNote({ ok: false, text: say(e) });
      setBusy(null);
    }
  };

  return { busy, note, ready, setReady, exportAll, pick, doImport };
}

/** Confirmation before an import replaces everything. Cancel has focus. */
function ImportConfirm({ ready, onReplace, onCancel }: { ready: Ready; onReplace: () => void; onCancel: () => void }) {
  return (
    <div className="dp-confirm" role="alertdialog" aria-label="Import everything">
      <p className="hint">
        Replace everything here with this file{ready.header.createdAt ? ` (made ${new Date(ready.header.createdAt).toLocaleString()})` : ""}? Your plan, settings, pieces and files will be replaced. A safety copy of what you have now is kept on the server.
      </p>
      <div className="dp-actions">
        <button type="button" className="btn danger" onClick={onReplace}>Replace everything</button>
        <button type="button" className="btn" autoFocus onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

/** One file with everything: plan and its versions, settings, your own pieces, imported 3D models and car models, calendar events, this device's display and graphics settings. */
export default function EverythingSection() {
  const { busy, note, ready, setReady, exportAll, pick, doImport } = useEverything();
  const picker = useRef<HTMLInputElement>(null);

  return (
    <section className="dp-sec" aria-label="Everything in one file">
      <h2 className="dp-h"><MonoLabel>Everything in one file</MonoLabel></h2>
      <p className="hint">Your plan and its saved versions, settings, own pieces, imported 3D models, calendar events and this screen&rsquo;s display settings, in one {FILE_EXT} file. Use it to move to a new computer or keep a copy.</p>
      <div className="dp-actions row">
        <button type="button" className="btn primary" disabled={busy !== null} onClick={() => void exportAll()}>{busy === "export" ? "Preparing..." : "Export everything"}</button>
        <button type="button" className="btn" disabled={busy !== null} onClick={() => picker.current?.click()}>{busy === "import" ? "Importing..." : "Import everything"}</button>
        <input
          ref={picker}
          type="file"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          accept={`${FILE_EXT},application/octet-stream`}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = ""; // picking the same file again must still fire
            if (f) void pick(f);
          }}
        />
      </div>
      {ready && <ImportConfirm ready={ready} onReplace={() => void doImport(ready)} onCancel={() => setReady(null)} />}
      <p className={`field-note ${note?.ok ? "ok" : "warn"}`} role="status" aria-live="polite">{note?.text}</p>
    </section>
  );
}
