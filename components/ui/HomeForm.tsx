"use client";
import { EyeIcon, EyeSlashIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { HomesError, addHome, patchHome, testHome, type Home } from "@/lib/homesApi";
import { homesChanged } from "@/lib/homes";
import MonoLabel from "./MonoLabel";
import { say } from "./planUi";
import "./homes.css";

/** What the form is for: a new home, a new name or address for a saved home, or only a new token for it. */
export type HomeFormMode = { is: "add" } | { is: "edit"; home: Home } | { is: "token"; home: Home };

export const TOKEN_HELP = "Home Assistant > your profile > Security > Long-lived access tokens > Create token. Paste it here. Doshy stores it encrypted on this server and never shows it again.";
const MAX_NAME = 40;

/** The address without a trailing slash, to tell whether the person really changed it (the server does the same tidying). */
const tidy = (url: string): string => url.trim().replace(/\/+$/, "");

const message = (e: unknown): string => (e instanceof HomesError || e instanceof Error ? e.message : "Something went wrong. Please try again.");

/**
 * One form for the three jobs. A wrong answer keeps every typed value. The token is only ever typed here, never shown back: after saving the row shows its last 4 characters.
 * A saved home whose ADDRESS changes needs its token again (the server insists: the old token belongs to the old address).
 */
export default function HomeForm({ mode, onDone, onCancel }: { mode: HomeFormMode; onDone: () => void; onCancel: () => void }) {
  const home = mode.is === "add" ? null : mode.home;
  const [name, setName] = useState(home?.name ?? "");
  const [url, setUrl] = useState(home?.url ?? "");
  const [token, setToken] = useState("");
  const [shown, setShown] = useState(false);
  const [asked, setAsked] = useState(false); // the server said the token is needed even though the address looks the same
  const [problem, setProblem] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [tested, setTested] = useState(false); // the values now typed were tried and worked
  const [busy, setBusy] = useState<"test" | "save" | null>(null);

  const addressChanged = mode.is === "edit" && home !== null && tidy(url) !== tidy(home.url);
  const showName = mode.is !== "token";
  const showUrl = mode.is !== "token";
  const showToken = mode.is === "add" || mode.is === "token" || addressChanged || asked;
  const changed = () => {
    setProblem(null);
    setResult(null);
    setTested(false);
  };

  const test = async () => {
    setBusy("test");
    setProblem(null);
    setResult(null);
    try {
      const input = home ? { id: home.id, ...(showUrl && addressChanged ? { url: url.trim() } : {}), ...(token ? { token } : {}) } : { url: url.trim(), token };
      const r = await testHome(input);
      setTested(r.ok);
      setResult(r.ok ? { ok: true, text: `Connected. Home Assistant ${r.version}${r.locationName ? `, "${r.locationName}"` : ""}.` } : { ok: false, text: `Not reachable: ${r.error}` });
    } catch (e) {
      setResult({ ok: false, text: message(e) });
    }
    setBusy(null);
  };

  const save = async () => {
    const clean = name.trim();
    if (showName && !clean) return setProblem("Give the home a name.");
    if (showUrl && !url.trim()) return setProblem("Enter the address of Home Assistant, for example http://homeassistant.local:8123");
    if (showToken && !token) return setProblem(mode.is === "add" ? "Paste the long-lived access token." : "Paste the token to go with this address.");
    setBusy("save");
    setProblem(null);
    try {
      if (mode.is === "add") await addHome({ name: clean, url: url.trim(), token });
      else if (home) {
        const patch = { ...(showName && clean !== home.name ? { name: clean } : {}), ...(addressChanged ? { url: url.trim() } : {}), ...(token ? { token } : {}) };
        if (Object.keys(patch).length === 0) return onDone(); // nothing changed
        await patchHome(home.id, patch);
      }
      await homesChanged();
      say(tested || (home !== null && !addressChanged && !token) ? `Saved "${clean || home?.name}".` : "Saved without testing.");
      onDone();
    } catch (e) {
      if (e instanceof HomesError && e.code === "token_needed") setAsked(true);
      setProblem(message(e));
      setBusy(null);
    }
  };

  const title = mode.is === "add" ? "Add a home" : mode.is === "edit" ? `Edit ${mode.home.name}` : `New token for ${mode.home.name}`;
  return (
    <form className="pf hm-form" onSubmit={(e) => { e.preventDefault(); void save(); }} aria-label={title}>
      <MonoLabel>{title}</MonoLabel>
      {showName && (
        <label className="pf-field">
          <span className="label">Name</span>
          <input value={name} maxLength={MAX_NAME} autoFocus autoComplete="off" placeholder="Holiday house" onChange={(e) => { setName(e.target.value); changed(); }} />
        </label>
      )}
      {showUrl && (
        <label className="pf-field">
          <span className="label">Address</span>
          <input value={url} inputMode="url" autoComplete="off" autoCapitalize="off" spellCheck={false} placeholder="http://homeassistant.local:8123" onChange={(e) => { setUrl(e.target.value); changed(); }} />
        </label>
      )}
      {addressChanged && <p className="hint">You changed the address, so enter the token again: the old token belongs to the old address.</p>}
      {showToken && (
        <div className="pf-field">
          <label htmlFor="hm-token" className="label">{mode.is === "add" ? "Long-lived access token" : "New long-lived access token"}</label>
          <div className="hm-token">
            <input id="hm-token" type={shown ? "text" : "password"} value={token} autoComplete="off" autoCapitalize="off" spellCheck={false} autoFocus={!showName} aria-describedby="hm-token-help" onChange={(e) => { setToken(e.target.value); changed(); }} />
            <button type="button" className="btn hm-eye" aria-pressed={shown} aria-label={shown ? "Hide the token" : "Show the token"} onClick={() => setShown((s) => !s)}>
              {shown ? <EyeSlashIcon size={16} aria-hidden /> : <EyeIcon size={16} aria-hidden />}
            </button>
          </div>
          <p className="hint" id="hm-token-help">{TOKEN_HELP}</p>
        </div>
      )}
      {result && <p className="hm-result" data-ok={result.ok} role="status">{result.text}</p>}
      {problem && <p className="field-note warn" role="alert">{problem}</p>}
      <div className="pf-actions">
        <button type="submit" className="btn primary" disabled={busy !== null}>{busy === "save" ? "Saving..." : "Save"}</button>
        <button type="button" className="btn" disabled={busy !== null || (mode.is === "add" ? !url.trim() || !token : mode.is === "token" && !token)} onClick={() => void test()}>{busy === "test" ? "Testing..." : "Test connection"}</button>
        <button type="button" className="btn" disabled={busy !== null} onClick={onCancel}>Cancel</button>
      </div>
      {mode.is === "add" && <p className="hint">You can save without testing, for example for a house that is switched off now.</p>}
    </form>
  );
}
