"use client";
import { CopyIcon, TrashIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { useActivePlan } from "@/lib/activePlan";
import { ApiError } from "@/lib/dbApi";
import { guestUrl, linkLine } from "@/lib/guestLinkText";
import { createLink, fetchLinks, revokeLink, type Expiry, type GuestLinkInfo } from "@/lib/guestLinksApi";
import { copyText } from "./planUi";
import type { SharePageProps } from "./sharePages";
import "./guest.css";

const EXPIRY_LABEL: Record<Expiry, string> = { "1h": "1 hour", "1d": "1 day", "7d": "7 days", never: "Never" };
const EXPIRIES = Object.keys(EXPIRY_LABEL) as Expiry[];

const problem = (e: unknown): string => (e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong. Try again.");

/** Share > Share a read-only link: make a link to look around ONE plan (optionally behind a PIN), see the links already made and turn them off. */
export default function GuestLinks({ planId }: SharePageProps) {
  const activeId = useActivePlan((s) => s.id);
  const id = planId ?? activeId;
  const plan = useActivePlan((s) => s.list?.find((d) => d.id === id));
  const [links, setLinks] = useState<GuestLinkInfo[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState("");
  const [pin, setPin] = useState("");
  const [expires, setExpires] = useState<Expiry>("1d");
  const [live, setLive] = useState(false);
  const [location, setLocation] = useState(false);
  const [fresh, setFresh] = useState<{ url: string; pin: boolean; copied: boolean } | null>(null);
  const [asking, setAsking] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (id === null) return;
    try {
      setLinks(await fetchLinks(id));
    } catch (e) {
      setError(problem(e));
    }
  }, [id]);
  useEffect(() => void reload(), [reload]);

  if (id === null) return <p className="field-note">Doshy is still opening the plan. Try again in a moment.</p>;

  const make = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pin !== "" && !/^\d{4,8}$/.test(pin)) return setError("A PIN is 4 to 8 digits, or leave it empty for no PIN.");
    setBusy(true);
    setError("");
    try {
      const made = await createLink({ dashboardId: id, label, pin, expires, live, location });
      setFresh({ url: guestUrl(window.location.origin, made.token), pin: made.link.pin, copied: false });
      setLabel("");
      setPin("");
      await reload();
    } catch (err) {
      setError(problem(err));
    }
    setBusy(false);
  };

  const turnOff = async (linkId: string) => {
    setBusy(true);
    setError("");
    try {
      await revokeLink(linkId);
      setAsking(null);
      await reload();
    } catch (err) {
      setError(problem(err));
    }
    setBusy(false);
  };

  return (
    <>
      <p className="guest-warn" role="note">
        Anyone who can reach this Doshy address can open the whole Doshy, not just this link. A read-only link is only safe to send outside your home network when it goes through a reverse proxy or tunnel that lets through <b>only</b> /view and /api/guest
        (see docs/sharing.md), or to a second Doshy started with DOSHY_GUEST_ONLY=1.
      </p>

      {fresh && (
        <section className="guest-fresh" aria-label="Your new link">
          <b>Your link{fresh.pin ? " (the PIN is not part of it: tell them separately)" : ""}</b>
          <input readOnly value={fresh.url} aria-label="Link address" onFocus={(e) => e.currentTarget.select()} />
          <small className="field-note">This is the only time the full address is shown. Doshy keeps only a fingerprint of it.</small>
          <div className="shr-actions">
            <button
              type="button"
              className="btn primary"
              onClick={async () => setFresh({ ...fresh, copied: await copyText(fresh.url) })}
            >
              <CopyIcon size={14} aria-hidden /> {fresh.copied ? "Copied" : "Copy the link"}
            </button>
            <button type="button" className="btn" onClick={() => setFresh(null)}>Done</button>
          </div>
        </section>
      )}

      <form className="guest-form" onSubmit={make} aria-label="Make a link">
        <p className="field-note">Makes a link to {plan ? <b>{plan.name}</b> : "this plan"}. People with it can look around in 3D, nothing more.</p>
        <label className="field">
          <span className="label">Name (only you see it)</span>
          <input value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} placeholder="For example: Mum" />
        </label>
        <label className="field">
          <span className="label">PIN (optional, 4 to 8 digits)</span>
          <input value={pin} inputMode="numeric" autoComplete="off" maxLength={8} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
        </label>
        <label className="field">
          <span className="label">Works for</span>
          <select value={expires} onChange={(e) => setExpires(e.target.value as Expiry)}>
            {EXPIRIES.map((k) => (
              <option key={k} value={k}>{EXPIRY_LABEL[k]}</option>
            ))}
          </select>
        </label>
        <label className="guest-check">
          <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} />
          <span>
            Show live states (read-only)
            <small className="field-note">Lights and sensors show on, off or a number. Names and details stay private.</small>
          </span>
        </label>
        <label className="guest-check">
          <input type="checkbox" checked={location} onChange={(e) => setLocation(e.target.checked)} />
          <span>
            Show the real home location
            <small className="field-note">Off: the home sits on a plain ground with no map, address or compass.</small>
          </span>
        </label>
        <div className="shr-actions">
          <button type="submit" className="btn primary" disabled={busy}>Make a link</button>
        </div>
      </form>

      {error && <p className="guest-warn" role="alert">{error}</p>}

      <section className="shr-section" aria-label="Links already made">
        <span className="label">Links for this plan</span>
        {links === null ? (
          <p className="field-note">Loading...</p>
        ) : links.length === 0 ? (
          <p className="field-note">No links yet.</p>
        ) : (
          <ul className="guest-links">
            {links.map((l) => (
              <li key={l.id} className="guest-link" data-expired={l.expired}>
                <div className="guest-link-head">
                  <b>{l.label || "Link"}</b>
                  {asking === l.id ? (
                    <>
                      <button type="button" className="btn danger" disabled={busy} onClick={() => void turnOff(l.id)}>Turn off now</button>
                      <button type="button" className="btn" onClick={() => setAsking(null)}>Keep</button>
                    </>
                  ) : (
                    <button type="button" className="btn" aria-label={`Turn off ${l.label || "link"}`} onClick={() => setAsking(l.id)}>
                      <TrashIcon size={14} aria-hidden /> Turn off
                    </button>
                  )}
                </div>
                <small>{linkLine(l)}</small>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
