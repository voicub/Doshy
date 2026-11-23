"use client";
import { Fragment, useMemo, useState, type ReactNode } from "react";
import { attentionItems, relativeTime, type Notification } from "@/lib/haNotify";
import type { Block, Inline } from "@/lib/safeMarkdown";
import { parseMarkdown } from "@/lib/safeMarkdown";
import { useStore } from "@/lib/store";
import { useInbox } from "./inboxStore";

function inline(nodes: Inline[]): ReactNode {
  return nodes.map((n, i) => {
    if (typeof n === "string") return <Fragment key={i}>{n}</Fragment>;
    if (n.t === "br") return <br key={i} />;
    if (n.t === "a") return <a key={i} href={n.href} target="_blank" rel="noopener noreferrer">{inline(n.c)}</a>;
    const Tag = n.t === "b" ? "strong" : n.t === "i" ? "em" : "code";
    return <Tag key={i}>{inline(n.c)}</Tag>;
  });
}

/** Notification text as safe React elements (see lib/safeMarkdown.ts: no HTML is ever injected). */
function Message({ text }: { text: string }) {
  const blocks = useMemo<Block[]>(() => parseMarkdown(text), [text]);
  return (
    <div className="nt-msg">
      {blocks.map((b, i) =>
        b.t === "p" ? <p key={i}>{inline(b.c)}</p> : b.t === "ul" ? <ul key={i}>{b.items.map((it, j) => <li key={j}>{inline(it)}</li>)}</ul> : <ol key={i}>{b.items.map((it, j) => <li key={j}>{inline(it)}</li>)}</ol>,
      )}
    </div>
  );
}

function Item({ n, busy, onDismiss }: { n: Notification; busy: boolean; onDismiss: () => void }) {
  return (
    <li className="nt-item">
      <div className="nt-top">
        <strong className="nt-title">{n.title}</strong>
        <time className="nt-time" dateTime={n.created_at}>{relativeTime(n.created_at)}</time>
      </div>
      <Message text={n.message} />
      <button className="nt-btn" disabled={busy} onClick={onDismiss}>Dismiss</button>
    </li>
  );
}

const MAX_ATTENTION = 8;

export default function NotificationsPanel() {
  const { notifications, loaded, unavailable, error, dismiss } = useInbox();
  const states = useStore((s) => s.states);
  const attention = useMemo(() => attentionItems(states), [states]);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const run = async (ids: string[]) => {
    setBusy(true);
    await dismiss(ids);
    setBusy(false);
    setConfirm(false);
  };

  return (
    <div className="nt">
      {error && <p className="nt-err" role="alert">{error}</p>}
      {unavailable && <p className="nt-note" role="status">{loaded ? "Could not refresh. Showing the last list." : "Notifications are not available right now."}</p>}
      {!unavailable && loaded && notifications.length === 0 && <p className="nt-empty">Nothing needs your attention. New notifications from Home Assistant show up here.</p>}
      {notifications.length > 0 && (
        <>
          <div className="nt-bar">
            {confirm ? (
              <>
                <span className="nt-ask">Dismiss all {notifications.length} in Home Assistant?</span>
                <button className="nt-btn danger" disabled={busy} onClick={() => void run(notifications.map((n) => n.id))}>Yes, dismiss all</button>
                <button className="nt-btn" disabled={busy} onClick={() => setConfirm(false)}>Cancel</button>
              </>
            ) : (
              <button className="nt-btn" disabled={busy} onClick={() => setConfirm(true)}>Dismiss all</button>
            )}
          </div>
          <ul className="nt-list">{notifications.map((n) => <Item key={n.id} n={n} busy={busy} onDismiss={() => void run([n.id])} />)}</ul>
        </>
      )}
      {attention.length > 0 && (
        <section className="nt-att" aria-label="Sensors that need a look">
          <span className="label">Needs a look</span>
          <ul>
            {attention.slice(0, MAX_ATTENTION).map((a) => <li key={a.id}><span>{a.name}</span><small>{a.why === "battery" ? "battery low" : "problem"}</small></li>)}
          </ul>
          {attention.length > MAX_ATTENTION && <small className="nt-more">and {attention.length - MAX_ATTENTION} more</small>}
        </section>
      )}
    </div>
  );
}
