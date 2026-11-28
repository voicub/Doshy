"use client";
import HudPanel from "./HudPanel";
import { BackupSection, FilesSection, KeptSection, VersionsSection } from "./DataSections";
import { SyncLine, When, size } from "./DataBits";
import EverythingSection from "./EverythingSection";
import MonoLabel from "./MonoLabel";
import useDataPanel from "./useDataPanel";
import "./dataPanel.css";

/** Data and backups: saved versions of the plan, uploaded files, and a backup to download or import. */
export default function DataPanel({ onClose, onHomes }: { onClose: () => void; /** open the Homes manager (the plan manager's homes view) */ onHomes?: () => void }) {
  const d = useDataPanel();
  const { data, problem, note, busy, ask, setAsk } = d;
  const off = busy !== null;

  return (
    <HudPanel title="Data and backups" onClose={onClose} className="drawer dp">
      <div className="dp-body">
        {!data ? (
          problem ? (
            <div className="dp-fail" role="alert">
              <p className="hint">{problem}</p>
              <button type="button" className="btn" onClick={() => void d.load()}>Try again</button>
            </div>
          ) : (
            <p className="hint" role="status">Loading...</p>
          )
        ) : (
          <>
            {problem && <p className="field-note warn" role="status">{problem}</p>}
            <EverythingSection />
            <dl className="dp-sum">
              <dt><MonoLabel>Stored on the server</MonoLabel></dt>
              <dd>{size(data.info.bytes)}</dd>
              <dt><MonoLabel>Last saved</MonoLabel></dt>
              <dd><When ms={data.info.lastSavedAt} /></dd>
              <dt><MonoLabel>Last automatic backup</MonoLabel></dt>
              <dd><When ms={data.info.lastBackupAt} /></dd>
              <dt><MonoLabel>Sync status</MonoLabel></dt>
              <dd><SyncLine /></dd>
            </dl>

            <VersionsSection data={data} off={off} ask={ask} setAsk={setAsk} name={d.name} setName={d.setName} onSave={d.save} onRestore={(id) => void d.restore(id)} />
            <KeptSection kept={d.kept} off={off} onRestore={d.restoreKept} />
            <FilesSection files={data.files} off={off} ask={ask} setAsk={setAsk} onDelete={(r) => void d.remove(r)} />
            <BackupSection off={off} importing={busy === "import"} file={d.file} setFile={d.setFile} onImport={(f) => void d.doImport(f)} />
            {onHomes && (
              <section className="dp-homes" aria-label="Other homes">
                <MonoLabel>Other homes</MonoLabel>
                <p className="hint">Each plan can show its own Home Assistant. A backup keeps the homes' names and addresses, but the tokens in it are scrambled and the key stays in a file next to the database on this server: restored on another machine, a home asks for its token again.</p>
                <button type="button" className="btn" onClick={onHomes}>Manage homes</button>
              </section>
            )}
          </>
        )}
        <p className={`field-note ${note?.ok ? "ok" : "warn"}`} role="status" aria-live="polite">{note?.text}</p>
      </div>
    </HudPanel>
  );
}
