"use client";
import { CaretLeftIcon } from "@phosphor-icons/react";
import { useEffect, useRef } from "react";
import HudPanel from "./HudPanel";
import { SHARE_PAGES } from "./sharePages";
import { useShareUi } from "./shareUi";
import useRestoreFocus from "./useRestoreFocus";
import "./share.css";

/** The Share dialog: a list of things to share (a picture, a turntable video, a read-only link, your own pieces) and the page of the one chosen. */
export default function ShareSheet() {
  const page = useShareUi((s) => s.page);
  const planId = useShareUi((s) => s.planId);
  const setPage = useShareUi((s) => s.setPage);
  const close = useShareUi((s) => s.close);
  const root = useRef<HTMLDivElement>(null);
  const def = SHARE_PAGES.find((p) => p.id === page);

  useRestoreFocus();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !e.defaultPrevented && useShareUi.getState().close();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  // move focus into the dialog whenever its page changes
  useEffect(() => {
    root.current?.querySelector<HTMLElement>(".shr-body button, .shr-body input, .shr-body select")?.focus();
  }, [page]);

  return (
    <div className="shr-scrim" ref={root} role="dialog" aria-modal="true" aria-label="Share" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <HudPanel title={def ? def.title : "Share"} onClose={close} className="shr">
        <div className="shr-body">
          {def ? (
            <>
              <button type="button" className="shr-back" onClick={() => setPage("menu")}>
                <CaretLeftIcon size={12} /> All the ways to share
              </button>
              <def.Page onBack={() => setPage("menu")} onClose={close} planId={planId} />
            </>
          ) : (
            <ul className="shr-menu">
              {SHARE_PAGES.map((p) => (
                <li key={p.id}>
                  <button type="button" className="shr-row" onClick={() => setPage(p.id)}>
                    <span className="shr-ico" aria-hidden>{p.icon}</span>
                    <span className="shr-text">
                      <b>{p.title}</b>
                      <small>{p.blurb}</small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </HudPanel>
    </div>
  );
}
