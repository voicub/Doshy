// Home Assistant persistent notifications: shaping, "what is new", wording, and the one WebSocket read the server route makes.
import { isRecord } from "./guards.ts";
export type Notification = { id: string; title: string; message: string; created_at: string };

const MAX = 50;
const ID = /^[A-Za-z0-9_.-]{1,128}$/;
const str = (v: unknown) => (typeof v === "string" ? v : "");

/** Valid notifications only, newest first. Anything HA sends that is not shaped like a notification is dropped. */
export function shapeNotifications(raw: unknown): Notification[] {
  if (!Array.isArray(raw)) return [];
  const out: Notification[] = [];
  for (const r of raw) {
    if (!isRecord(r)) continue;
    const o = r;
    if (typeof o.notification_id !== "string" || !ID.test(o.notification_id)) continue;
    const message = str(o.message);
    out.push({ id: o.notification_id, title: str(o.title).trim() || "Notification", message, created_at: str(o.created_at) });
  }
  return out.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || 0).slice(0, MAX);
}

/** Notifications the user has not seen yet, and which ones have gone since (dismissed in HA or here). `seen` null = never opened. */
export function diffNotifications(seen: readonly string[] | null, now: readonly Notification[]) {
  const have = new Set(now.map((n) => n.id));
  const known = new Set(seen ?? []);
  return { fresh: now.filter((n) => !known.has(n.id)), gone: (seen ?? []).filter((id) => !have.has(id)) };
}

/** "just now", "5 min ago", "3 h ago", "2 days ago", then the date. */
export function relativeTime(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d < 14 ? `${d} day${d === 1 ? "" : "s"} ago` : new Date(t).toISOString().slice(0, 10);
}

type States = Record<string, { state: string; attributes: { friendly_name?: string; device_class?: string } }>;
type Attention = { id: string; name: string; why: "problem" | "battery" };

/** Sensors that are reporting a problem or a low battery right now. */
export function attentionItems(states: States): Attention[] {
  const out: Attention[] = [];
  for (const [id, st] of Object.entries(states)) {
    if (!id.startsWith("binary_sensor.") || st.state !== "on") continue;
    const why = st.attributes.device_class === "problem" ? "problem" : st.attributes.device_class === "battery" ? "battery" : null;
    if (why) out.push({ id, name: st.attributes.friendly_name ?? id, why });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Just enough of the WebSocket API for the read below (the real global satisfies it; tests pass a fake). */
export type Socket = { send(data: string): void; close(): void; onmessage: ((e: { data: unknown }) => void) | null; onerror: ((e: unknown) => void) | null; onclose: ((e: unknown) => void) | null };
export type SocketFactory = new (url: string) => Socket;

export const socketUrl = (base: string) => `${base.replace(/\/+$/, "").replace(/^http/, "ws")}/api/websocket`;

/** Sends one command over HA's WebSocket API (after the token handshake) and resolves with its `result`. Rejects on auth failure, a failed command (`failure`), error, close or timeout. */
export function wsCommand(base: string, token: string, WS: SocketFactory, command: Record<string, unknown>, failure: string, timeoutMs = 5000): Promise<unknown> {
  const { promise, resolve, reject } = Promise.withResolvers<unknown>();
  const ws = new WS(socketUrl(base));
  const end = (fn: () => void) => {
    ws.onclose = ws.onerror = null;
    clearTimeout(timer);
    try { ws.close(); } catch { /* already closed */ }
    fn();
  };
  const timer = setTimeout(() => end(() => reject(new Error("Home Assistant did not answer in time"))), timeoutMs);
  ws.onerror = () => end(() => reject(new Error("Could not reach Home Assistant")));
  ws.onclose = () => end(() => reject(new Error("Connection closed")));
  ws.onmessage = (e) => {
    let m: { type?: string; id?: number; success?: boolean; result?: unknown };
    try { m = JSON.parse(String(e.data)); } catch { return; }
    if (m.type === "auth_required") ws.send(JSON.stringify({ type: "auth", access_token: token }));
    else if (m.type === "auth_ok") ws.send(JSON.stringify({ id: 1, ...command }));
    else if (m.type === "auth_invalid") end(() => reject(new Error("Home Assistant refused the token")));
    else if (m.id === 1 && m.type === "result") end(() => (m.success ? resolve(m.result) : reject(new Error(failure))));
  };
  return promise;
}

/** Asks HA for its persistent notifications over the WebSocket API. Rejects on auth failure, error, close or timeout. */
export async function readNotifications(base: string, token: string, WS: SocketFactory, timeoutMs = 5000): Promise<Notification[]> {
  return shapeNotifications(await wsCommand(base, token, WS, { type: "persistent_notification/get" }, "Home Assistant could not list notifications", timeoutMs));
}
