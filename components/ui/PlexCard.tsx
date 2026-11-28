"use client";
import { PowerIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { mediaImageUrl } from "@/lib/ha";
import { episodeLabel, isDead, pickTv, playbackEntity, positionAt, tvIsOn } from "@/lib/plex";
import { useStore } from "@/lib/store";
import HudPanel from "./HudPanel";
import { NowPlaying, RemoteSection, SeekBar, SourceSection, TransportRow, VolumeRow } from "./PlexParts";
import { patchState } from "./serviceActions";
import usePlexCommands from "./usePlexCommands";
import { PROGRESS_TICK_MS } from "./mediaUi";
import { useNow } from "../useNow";
import "./PlexCard.css";
import DeviceGlyph from "./DeviceGlyph";

/** Bedroom TV and Plex: now playing with artwork and seeking, transport, volume, power, a D-pad remote and Plex launch. */
export default function PlexCard({ onClose }: { onClose: () => void }) {
  const states = useStore((s) => s.states);
  const loaded = Object.keys(states).length > 0;
  const tv = useMemo(() => pickTv(states), [states]);
  const playId = playbackEntity(tv, states);
  const play = playId ? states[playId] : undefined;
  const power = tv.power ? states[tv.power] : undefined;
  const remote = tv.remote ? states[tv.remote] : undefined;
  const plex = tv.plex ? states[tv.plex] : undefined;
  const on = tvIsOn(tv, states);
  const plexDown = !plex || isDead(plex);
  const a = play?.attributes ?? {};
  const playing = play?.state === "playing";
  const active = !!play && !isDead(play) && play.state !== "off";

  const { error, busy, mp, key, togglePower, openPlex } = usePlexCommands(tv, on, remote);
  const now = useNow(PROGRESS_TICK_MS, playing);
  const [scrub, setScrub] = useState<number | null>(null);

  const duration = typeof a.media_duration === "number" ? a.media_duration : 0;
  const position = scrub ?? positionAt(play, now);
  const commitSeek = (sec: number) => {
    if (!playId) return;
    const s = Math.round(sec);
    void mp(playId, "media_seek", { seek_position: s }, () => patchState(playId, { media_position: s, media_position_updated_at: new Date().toISOString() }));
    setScrub(null);
  };

  // volume lives on whichever of TV / Plex client reports it
  const volId = [tv.power, playId, tv.plex].find((i) => i && typeof states[i]?.attributes.volume_level === "number" && !isDead(states[i]));
  const vol = volId ? states[volId].attributes : undefined;
  const volTarget = volId ?? tv.power;

  const title = a.media_title ?? (active ? a.app_name ?? a.source : undefined);
  const ep = episodeLabel(a);
  const sources = a.source_list ?? states[tv.power ?? ""]?.attributes.source_list ?? [];
  const art = active && playId && a.entity_picture ? mediaImageUrl(playId, a.entity_picture) : undefined;
  const [artOk, setArtOk] = useState(true);
  useEffect(() => setArtOk(true), [art]);

  const status = !loaded ? "Waiting for Home Assistant." : !tv.power && !tv.remote && !tv.plex ? "No TV or Plex entities found in Home Assistant." : null;

  return (
    <HudPanel title="Plex / TV" meta={power?.attributes.friendly_name ?? "Bedroom TV"} onClose={onClose} className="drawer plexcard">
      <div className="cl-body" onKeyDown={(e) => e.key === "Escape" && (e.preventDefault(), e.stopPropagation(), onClose())}>
        {status ? <p className="empty">{status}</p> : (
          <>
            <div className="pc-power">
              <span className={`pc-dot ${on ? "on" : ""}`} aria-hidden />
              <span className="t-val"><DeviceGlyph entity={tv.power ?? playId} /> {on ? "TV ON" : power?.state === "unavailable" ? "TV UNAVAILABLE" : "TV OFF"}</span>
              <button className={`btn pc-pbtn ${on ? "" : "primary"}`} onClick={togglePower} aria-label={on ? "Turn TV off" : "Turn TV on"} disabled={busy}>
                <PowerIcon size={14} /> {on ? "Power off" : "Power on"}
              </button>
            </div>

            {!on ? (
              <p className="pc-note">The TV is off. Turn it on to browse or play Plex; the Plex client reports only while the TV runs.</p>
            ) : (
              <NowPlaying attrs={a} playState={play?.state} active={active} plexDown={plexDown} title={title} episode={ep} art={art} artOk={artOk} onArtError={() => setArtOk(false)} />
            )}

            {on && plexDown && <p className="field-note">Plex client unavailable: it only appears once Plex is open on the TV. Use Open Plex below.</p>}

            {on && active && duration > 0 && <SeekBar position={position} duration={duration} onScrub={setScrub} onCommit={commitSeek} />}

            {on && <TransportRow playId={playId} active={active} playing={playing} mp={mp} />}

            {on && volTarget && <VolumeRow vol={vol} target={volTarget} mp={mp} />}

            {on && tv.remote && <RemoteSection onKey={key} />}

            {on && tv.remote && (
              <button className="btn pc-open" onClick={openPlex} disabled={busy}>Open Plex</button>
            )}

            {on && sources.length > 0 && <SourceSection sources={sources} current={a.source} onPick={(source) => void mp(playId ?? tv.power, "select_source", { source })} />}
          </>
        )}
        {error && <p className="field-note warn" role="alert">{error}</p>}
      </div>
    </HudPanel>
  );
}
