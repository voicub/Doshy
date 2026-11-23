"use client";
import { useMemo } from "react";
import { listUpdates, type UpdateItem } from "@/lib/haUpdates";
import { useStore } from "@/lib/store";

function Row({ u }: { u: UpdateItem }) {
  return (
    <li className="up-item">
      <div className="up-top">
        <strong className="up-name">{u.name}</strong>
        <span className="up-ver">{u.versions}</span>
      </div>
      {u.summary && <p className="up-sum">{u.summary}</p>}
      {u.installing && (
        <div className="lb-meter" role="progressbar" aria-label={`Installing ${u.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={u.percent ?? undefined}>
          <i style={{ width: `${u.percent ?? 100}%` }} className={u.percent === null ? "up-busy" : ""} />
        </div>
      )}
      {u.releaseUrl && <a className="up-link" href={u.releaseUrl} target="_blank" rel="noopener noreferrer">Release notes</a>}
    </li>
  );
}

/** Read-only: what Home Assistant says can be updated. Installing is done in Home Assistant itself. */
export default function UpdatesPanel() {
  const states = useStore((s) => s.states);
  const loading = useStore((s) => Object.keys(s.states).length === 0);
  const list = useMemo(() => listUpdates(states), [states]);
  if (loading) return <p className="nt-empty">Waiting for Home Assistant...</p>;
  return (
    <div className="nt">
      {list.availableCount === 0 && <p className="nt-empty">Everything is up to date.</p>}
      {list.available.map((g) => (
        <section key={g.kind} className="up-group" aria-label={g.label}>
          <span className="label">{g.label}</span>
          <ul className="nt-list">{g.items.map((u) => <Row key={u.id} u={u} />)}</ul>
        </section>
      ))}
      {list.skipped.length > 0 && (
        <details className="up-fold">
          <summary>{list.skipped.length} skipped</summary>
          <ul className="nt-list">{list.skipped.map((u) => <Row key={u.id} u={u} />)}</ul>
        </details>
      )}
      {list.upToDate.length > 0 && (
        <details className="up-fold">
          <summary>{list.upToDate.length} up to date</summary>
          <ul className="up-plain">{list.upToDate.map((u) => <li key={u.id}><span>{u.name}</span><small>{u.latest}</small></li>)}</ul>
        </details>
      )}
    </div>
  );
}
