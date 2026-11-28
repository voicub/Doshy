"use client";
import { ArrowsInSimpleIcon, ArrowsOutSimpleIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { lastMotion } from "@/lib/securityLook";
import { haFetch } from "@/lib/haHome";
import { REQUEST_TIMEOUT_MS, within } from "@/lib/requestTimeout";
import { useStore } from "@/lib/store";
import { hudScale, hudViewport } from "@/lib/displayStore";
import HudPanel from "./HudPanel";
import { useNow } from "../useNow";
import MonoLabel from "./MonoLabel";
import type { DeviceTarget } from "./serviceActions";
import "./cameraCard.css";
import DeviceGlyph from "./DeviceGlyph";

const REFRESH_MS = 3000; // a new snapshot this often while the card is open and the tab visible
const REFRESH_BIG_MS = 2000;
const WIDTH = 340;

type Status = "loading" | "live" | "error";

function since(iso?: string): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return "unknown";
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `${s} s ago`;
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

/**
 * Live snapshot of a camera: refreshed every few seconds through /api/ha/camera while the card is open and the page visible, and only then.
 * Read-only (a picture, nothing else): closing the card or hiding the tab stops every request.
 */
function useSnapshot(entity: string, every: number) {
  const [src, setSrc] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [at, setAt] = useState<number | null>(null);
  const url = useRef<string | null>(null);
  useEffect(() => {
    let etag: string | null = null;
    let timer: number | undefined;
    let ctl: AbortController | undefined;
    const stop = () => {
      clearTimeout(timer);
      ctl?.abort();
    };
    const tick = async () => {
      const mine = new AbortController();
      ctl = mine;
      try {
        const res = await haFetch(`/api/ha/camera?entity=${encodeURIComponent(entity)}`, { cache: "no-store", headers: etag ? { "If-None-Match": etag } : {}, signal: within(REQUEST_TIMEOUT_MS, mine.signal) });
        if (res.status === 200) {
          const next = URL.createObjectURL(await res.blob());
          etag = res.headers.get("ETag");
          const old = url.current;
          url.current = next;
          setSrc(next);
          if (old) URL.revokeObjectURL(old);
          setStatus("live");
          setAt(Date.now());
        } else if (res.status === 304) {
          setStatus("live");
          setAt(Date.now());
        } else if (res.status !== 429) setStatus("error"); // 429: asked a moment too soon, the next round will do
      } catch {
        if (!mine.signal.aborted) setStatus("error");
      }
      if (!document.hidden && !mine.signal.aborted) timer = window.setTimeout(() => void tick(), every);
    };
    const onVisibility = () => {
      stop();
      if (!document.hidden) void tick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    if (!document.hidden) void tick();
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      stop();
    };
  }, [entity, every]);
  useEffect(
    () => () => {
      if (url.current) URL.revokeObjectURL(url.current);
    },
    [],
  );
  return { src, status, at };
}

/** Floating card with a camera's picture: enlarge it, see its state and the last motion in its room. Closes with the X or Escape. */
export default function CameraCard({ target, onClose }: { target: DeviceTarget; onClose: () => void }) {
  const st = useStore((s) => s.states[target.entity]);
  const plan = useStore((s) => s.plan);
  const states = useStore((s) => s.states);
  const [big, setBig] = useState(false);
  const { src, status, at } = useSnapshot(target.entity, big ? REFRESH_BIG_MS : REFRESH_MS);
  useNow(1000); // re-renders so "x s ago" stays honest between snapshots
  const root = useRef<HTMLDivElement>(null);
  const name = st?.attributes.friendly_name ?? target.entity;
  const item = plan.items.find((i) => i.entity === target.entity);
  const motion = item ? lastMotion(plan, states, item) : undefined;

  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", key);
    root.current?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
    return () => document.removeEventListener("keydown", key);
  }, [onClose]);

  const style =
    !big && target.x != null && target.y != null
      ? { left: Math.max(12, Math.min(hudViewport().width - WIDTH - 12, target.x / hudScale() + 18)), top: Math.max(60, Math.min(hudViewport().height - 380, target.y / hudScale() - 40)) }
      : undefined;

  return (
    <div ref={root} className={`camcard${big ? " big" : ""}${!big && !style ? " center" : ""}`} style={style} role="dialog" aria-label={`Camera ${name}`}>
      <HudPanel title="camera" meta={target.entity} onClose={onClose} className="cc">
        <h2 className="hud-name"><DeviceGlyph entity={target.entity} size={20} /> {name}</h2>
        <div className="cc-frame">
          {src && <img src={src} alt={`Live snapshot of ${name}`} className={status === "error" ? "stale" : ""} />}
          {!src && <p className="field-note" role="status">{status === "error" ? "No picture. Is the camera online?" : "Loading picture..."}</p>}
          {src && status === "error" && <p className="cc-stale field-note warn" role="status">Connection lost: showing the last picture</p>}
        </div>
        <div className="cc-meta">
          <div className="cc-row">
            <MonoLabel>State</MonoLabel>
            <span className="t-val">{st ? st.state.replace(/_/g, " ") : "not reported"}</span>
            <small>{st?.last_changed ? `changed ${since(st.last_changed)}` : ""}</small>
          </div>
          {motion && (
            <div className="cc-row">
              <MonoLabel>Motion</MonoLabel>
              <span className={`t-val ${motion.now ? "warn" : ""}`}>{motion.now ? "now" : motion.at ? since(motion.at) : "none seen"}</span>
              <small>sensors in this room</small>
            </div>
          )}
        </div>
        <div className="cc-foot">
          <small className="field-note" aria-live="polite">{at ? `Updated ${since(new Date(at).toISOString())}. ` : ""}Refreshes every {(big ? REFRESH_BIG_MS : REFRESH_MS) / 1000} s while open.</small>
          <button className="btn cc-size" onClick={() => setBig((b) => !b)} aria-pressed={big} aria-label={big ? "Shrink picture" : "Enlarge picture"}>
            {big ? <ArrowsInSimpleIcon size={14} /> : <ArrowsOutSimpleIcon size={14} />}
            {big ? "Shrink" : "Enlarge"}
          </button>
        </div>
      </HudPanel>
    </div>
  );
}
