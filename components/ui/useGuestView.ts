"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchGuestPlan, fetchGuestStates, fetchSession, screenAfter } from "@/lib/guestApi";
import type { GuestReply } from "@/lib/guestData";
import { installGuestFetch } from "@/lib/guestFetch";
import { GUEST_TOKEN, putGuestDoc } from "@/lib/guestMode";
import { useCustom } from "@/lib/customStore";
import { STARTER_VERSION } from "@/lib/starterPlan";
import { useStore } from "@/lib/store";

/** What the guest page shows. `ready` has the plan's name and whether read-only live states are on. */
export type GuestScreen = { kind: "loading" } | { kind: "pin" } | { kind: "gone" } | { kind: "problem"; message: string } | { kind: "ready"; name: string; live: boolean };

const PLAN_POLL_MS = 30_000;
const STATES_POLL_MS = 5_000;

/** Put the shared plan on screen: its custom pieces first (so the catalog knows them), then the plan, in the stores that live only in this tab's memory (lib/guestMode). */
function show(reply: GuestReply): void {
  useCustom.setState({ pieces: reply.pieces });
  putGuestDoc("housey-plan", { plan: reply.plan, view: "live", cutaway: reply.cutaway, environment: reply.environment }, STARTER_VERSION);
}

/**
 * The guest page's data: ask whether the link needs a PIN, load the plan, keep it fresh (a changed plan every 30 s, live states every 5 s when the owner allowed them) and
 * notice when the link stops working. `enter` is the PIN form's way in once the server has accepted a PIN.
 */
export function useGuestView(token: string): { screen: GuestScreen; enter: () => void; retry: () => void } {
  const [screen, setScreen] = useState<GuestScreen>({ kind: "loading" });
  const rev = useRef<number | null>(null);
  const live = screen.kind === "ready" && screen.live;
  const ready = screen.kind === "ready";

  const load = useCallback(async () => {
    const r = await fetchGuestPlan(token);
    if (!r.ok) return setScreen(screenAfter(r));
    show(r.value);
    rev.current = r.value.rev;
    setScreen({ kind: "ready", name: r.value.name, live: r.value.live });
  }, [token]);

  const start = useCallback(async () => {
    setScreen({ kind: "loading" });
    if (!GUEST_TOKEN.test(token)) return setScreen({ kind: "gone" });
    const s = await fetchSession(token);
    if (!s.ok) return setScreen(s.status === 0 || s.status >= 500 || s.status === 429 ? { kind: "problem", message: s.message } : { kind: "gone" });
    if (s.value.unlocked) await load();
    else setScreen({ kind: "pin" });
  }, [token, load]);

  useEffect(() => {
    if (GUEST_TOKEN.test(token)) installGuestFetch(token); // before anything else can ask for something: only this link's own data may be requested
    void start();
  }, [token, start]);

  // a changed plan: look every 30 s while the page is visible
  useEffect(() => {
    if (!ready) return undefined;
    const t = setInterval(async () => {
      if (document.hidden) return;
      const r = await fetchGuestPlan(token);
      if (!r.ok) {
        const next = screenAfter(r);
        if (next.kind !== "problem") setScreen(next); // revoked or expired meanwhile / the session ended: a hiccup of the network is not worth interrupting the view for
        return;
      }
      if (r.value.rev === rev.current) return;
      show(r.value);
      rev.current = r.value.rev;
      setScreen((s) => (s.kind === "ready" ? { kind: "ready", name: r.value.name, live: r.value.live } : s));
    }, PLAN_POLL_MS);
    return () => clearInterval(t);
  }, [ready, token]);

  // live states (read-only), only for a link made with them
  useEffect(() => {
    if (!live) return undefined;
    let stop = false;
    const tick = async () => {
      if (document.hidden) return;
      const r = await fetchGuestStates(token);
      if (stop) return;
      if (r.ok) useStore.setState({ states: r.value });
      else if (r.status === 404) setScreen({ kind: "gone" });
    };
    void tick();
    const t = setInterval(tick, STATES_POLL_MS);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [live, token]);

  return { screen, enter: () => void load(), retry: () => void start() };
}
