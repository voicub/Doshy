"use client";
import { ArrowDownIcon, ArrowUpIcon, CaretDownIcon, CopyIcon, DownloadSimpleIcon, LinkIcon, PencilSimpleIcon, ShareNetworkIcon, StarIcon, TrashIcon } from "@phosphor-icons/react";
import { useEffect, useRef, type ReactNode } from "react";
import type { Dashboard } from "@/lib/dbApi";
import { agoText, countsText } from "@/lib/planLabels";
import { Confirm } from "./DataBits";
import { HomeTag } from "./HomePick";
import PlanThumb from "./PlanThumb";
import { PlanGlyph } from "./planUi";
import { useShareUi } from "./shareUi";

/** What a card's buttons do. Each returns when it is done; the manager decides what to show after. */
export type CardActions = {
  show: () => void;
  edit: () => void;
  duplicate: () => void;
  makeDefault: () => void;
  copyLink: () => void;
  exportFile: () => void;
  move: (by: -1 | 1) => void;
  ask: () => void;
  remove: () => void;
  stopAsking: () => void;
};

export type CardState = {
  isHere: boolean;
  isDefault: boolean;
  /** this plan is being switched to */
  loading: boolean;
  switching: boolean;
  open: boolean;
  asking: boolean;
  first: boolean;
  last: boolean;
  /** why Delete is not offered, in words; null = it can be deleted */
  keepReason: string | null;
  busy: boolean;
  onToggle: () => void;
};

function Row({ icon, label, onClick, disabled, danger, note }: { icon: ReactNode; label: string; onClick: () => void; disabled?: boolean; danger?: boolean; note?: string }) {
  return (
    <li>
      <button type="button" className={`pc-act ${danger ? "danger" : ""}`} disabled={disabled} onClick={onClick}>{icon}{label}</button>
      {note && <small className="pc-why">{note}</small>}
    </li>
  );
}

/** One plan in the manager: its picture, name and numbers, "Show this plan", and a "More" list with everything else you can do to it. */
export default function PlanCard({ d, s, a }: { d: Dashboard; s: CardState; a: CardActions }) {
  const more = `pc-more-${d.id}`;
  const question = useRef<HTMLDivElement>(null);
  // the question comes after the list of actions, which can be below the panel's fold: show it
  useEffect(() => {
    if (s.asking) question.current?.scrollIntoView({ block: "nearest" });
  }, [s.asking]);
  return (
    <li className="pc" data-active={s.isHere}>
      <div className="pc-main">
        <button type="button" className="pc-pic" tabIndex={-1} aria-hidden disabled={s.isHere || s.switching} onClick={a.show}><PlanThumb d={d} draw /></button>
        <div className="pc-text">
          <h3 className="pc-name"><PlanGlyph icon={d.icon} color={d.color} size={16} />{d.name}</h3>
          <p className="pc-meta">{[countsText(d.summary), d.rev > 0 ? agoText(d.updatedAt) : ""].filter(Boolean).join(" \u00b7 ")}</p>
          <HomeTag id={d.haConnection} />
          {(s.isHere || s.isDefault) && (
            <p className="pc-badges">
              {s.isHere && <span className="pc-badge here">This device</span>}
              {s.isDefault && <span className="pc-badge">Default for new devices</span>}
            </p>
          )}
          {d.description && <p className="pc-desc">{d.description}</p>}
        </div>
      </div>
      <div className="pc-bar">
        <button type="button" className="btn primary" disabled={s.isHere || s.switching} onClick={a.show}>{s.isHere ? "Shown now" : s.loading ? "Switching..." : "Show this plan"}</button>
        <button type="button" className="btn" aria-expanded={s.open} aria-controls={more} aria-label={`More for ${d.name}`} onClick={s.onToggle}>More<CaretDownIcon size={12} aria-hidden className="pc-caret" /></button>
      </div>
      {s.open && (
        <ul id={more} className="pc-acts" aria-label={`${d.name}: more`}>
          <Row icon={<PencilSimpleIcon size={16} aria-hidden />} label="Rename or edit" onClick={a.edit} disabled={s.busy} />
          <Row icon={<CopyIcon size={16} aria-hidden />} label="Duplicate" onClick={a.duplicate} disabled={s.busy} />
          <Row icon={<StarIcon size={16} aria-hidden />} label={s.isDefault ? "This is the default plan" : "Make default for new devices"} onClick={a.makeDefault} disabled={s.busy || s.isDefault} />
          <Row icon={<LinkIcon size={16} aria-hidden />} label="Copy a link that opens this plan" onClick={a.copyLink} />
          <Row icon={<ShareNetworkIcon size={16} aria-hidden />} label="Share a read-only link..." onClick={() => useShareUi.getState().show("link", d.id)} />
          <Row icon={<DownloadSimpleIcon size={16} aria-hidden />} label="Export this plan" onClick={a.exportFile} disabled={s.busy} />
          <Row icon={<ArrowUpIcon size={16} aria-hidden />} label="Move up" onClick={() => a.move(-1)} disabled={s.busy || s.first} />
          <Row icon={<ArrowDownIcon size={16} aria-hidden />} label="Move down" onClick={() => a.move(1)} disabled={s.busy || s.last} />
          <Row icon={<TrashIcon size={16} aria-hidden />} label="Delete" danger onClick={a.ask} disabled={s.busy || s.keepReason !== null} note={s.keepReason ?? undefined} />
        </ul>
      )}
      {s.asking && (
        <div ref={question}>
          <Confirm
            label={`Delete ${d.name}`}
            text={`Delete "${d.name}"${d.summary ? ` (${countsText(d.summary)})` : ""}? You can bring it back right afterwards with Undo.`}
            yes="Delete plan"
            onYes={a.remove}
            onNo={a.stopAsking}
          />
        </div>
      )}
    </li>
  );
}
