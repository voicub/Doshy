"use client";
import { useEffect, useRef, useState } from "react";
import PieceDialog from "@/components/PieceDialog";
import { errorMessage } from "@/lib/guards";
import { PH_CREDIT, PH_FILTERS, PH_PATREON, PH_SITE, type PhItem, type PhType } from "@/lib/polyhaven";
import { browse, PhRequestError, thumbSrc } from "@/lib/polyhavenClient";
import "./polyHaven.css";

const SEARCH_DELAY_MS = 250;

type Props = {
  type: PhType;
  title: string;
  /** The chip that starts selected (an id from `PH_FILTERS[type]`): "floor", "wall", "studio"... */
  initialFilter?: string;
  /** The button's words for the chosen asset: "Use this floor", "Use this lighting"... */
  pickLabel: string;
  /** Called with the chosen asset. May take a while (it downloads): the dialog shows "Working..." and keeps any thrown sentence under the bar. The caller closes the dialog when it is done. */
  onPick: (item: PhItem) => Promise<void>;
  onClose: () => void;
  /** One extra line about the chosen asset (its real size, a heavy-model warning). `warn` makes it a warning colour. */
  detail?: (item: PhItem) => { text: string; warn?: boolean } | null;
};

type Listing = { items: PhItem[]; total: number; page: number };

/**
 * Browse Poly Haven's free (CC0) HDRIs, textures or models: a search box, a few plain-English chips and a grid of pictures. The listing and the pictures come through this
 * app's own server (lib/polyhavenClient.ts); nothing is sent to Poly Haven from the browser. When the server cannot reach Poly Haven the dialog says so in a sentence.
 */
export default function PolyHavenBrowser({ type, title, initialFilter, pickLabel, onPick, onClose, detail }: Props) {
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<string | undefined>(initialFilter);
  const [list, setList] = useState<Listing | null>(null);
  const [error, setError] = useState<PhRequestError | string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [picked, setPicked] = useState<PhItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [pickErr, setPickErr] = useState<string | null>(null);
  const more = useRef<AbortController | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const ctl = new AbortController();
    more.current?.abort();
    more.current = ctl;
    setLoading(true);
    setError(null);
    browse(type, { q: query, filter, page: 0 }, ctl.signal)
      .then((p) => !ctl.signal.aborted && setList({ items: p.items, total: p.total, page: p.page }))
      .catch((e: unknown) => {
        if (!ctl.signal.aborted) setError(e instanceof PhRequestError ? e : errorMessage(e));
      })
      .finally(() => !ctl.signal.aborted && setLoading(false));
    return () => ctl.abort();
  }, [type, query, filter, retry]);

  const showMore = async () => {
    if (!list) return;
    const mine = more.current; // a new search or chip replaces it: a late page of the old one is dropped
    setLoading(true);
    try {
      const p = await browse(type, { q: query, filter, page: list.page + 1 });
      if (more.current === mine) setList((l) => (l ? { items: [...l.items, ...p.items.filter((n) => !l.items.some((o) => o.id === n.id))], total: p.total, page: p.page } : l));
    } catch (e) {
      if (more.current === mine) setError(e instanceof PhRequestError ? e : errorMessage(e));
    } finally {
      if (more.current === mine) setLoading(false);
    }
  };

  const pick = async () => {
    if (!picked) return;
    setBusy(true);
    setPickErr(null);
    try {
      await onPick(picked);
    } catch (e) {
      setPickErr(e instanceof PhRequestError ? e.message : errorMessage(e));
      setBusy(false);
    }
  };

  const extra = picked ? detail?.(picked) : null;
  const offline = error instanceof PhRequestError && error.offline;
  return (
    <PieceDialog title={title} onClose={onClose}>
      <div className="phb">
        <div className="phb-search">
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search, for example oak, brick or sofa" aria-label="Search Poly Haven" maxLength={60} />
        </div>
        <div className="phb-chips" role="group" aria-label="Narrow the choice">
          <button type="button" className="phb-chip" aria-pressed={filter === undefined} onClick={() => setFilter(undefined)}>All</button>
          {PH_FILTERS[type].map((f) => (
            <button key={f.id} type="button" className="phb-chip" aria-pressed={filter === f.id} onClick={() => setFilter(filter === f.id ? undefined : f.id)}>{f.label}</button>
          ))}
        </div>
        <div className="phb-scroll">
          {error && (
            <div className="phb-state" role="alert">
              <p className="field-note warn">{error instanceof PhRequestError ? error.message : error}</p>
              <button type="button" className="btn" onClick={() => setRetry((n) => n + 1)}>{offline ? "Try again" : "Retry"}</button>
            </div>
          )}
          {!error && list && list.items.length === 0 && !loading && <p className="phb-state field-note">Nothing matches that. Try another word or a different choice above.</p>}
          {list && list.items.length > 0 && !error && (
            <ul className="phb-grid" aria-label={`${list.total} results`}>
              {list.items.map((it) => (
                <li key={it.id}>
                  <button type="button" className="phb-card" aria-pressed={picked?.id === it.id} onClick={() => { setPicked(it); setPickErr(null); }}>
                    <img src={thumbSrc(it, 256)} alt="" loading="lazy" decoding="async" width={256} height={256} draggable={false} />
                    <span>{it.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {loading && <p className="phb-state field-note" role="status">{list ? "Loading more..." : "Loading..."}</p>}
          {!error && list && !loading && list.items.length < list.total && (
            <div className="phb-more">
              <button type="button" className="btn" onClick={() => void showMore()}>Show more ({list.total - list.items.length} left)</button>
            </div>
          )}
        </div>
        {picked && (
          <div className="phb-pick">
            <div className="phb-pick-main">
              <b>{picked.name}</b>
              <span>{picked.authors.length ? `by ${picked.authors.join(", ")}` : "Poly Haven"} / free to use (CC0)</span>
              {extra && <span className={extra.warn ? "phb-warn" : undefined}>{extra.text}</span>}
              {pickErr && <span className="phb-warn" role="alert">{pickErr}</span>}
            </div>
            <button type="button" className="btn primary" disabled={busy} onClick={() => void pick()}>{busy ? "Working..." : pickLabel}</button>
          </div>
        )}
      </div>
      <footer className="pb-foot">
        <span className="phb-credit">
          {PH_CREDIT}: <a href={PH_SITE} target="_blank" rel="noopener noreferrer">polyhaven.com</a>. <a href={PH_PATREON} target="_blank" rel="noopener noreferrer">Support them on Patreon</a>.
        </span>
        <button type="button" className="btn" onClick={onClose}>Close</button>
      </footer>
    </PieceDialog>
  );
}
