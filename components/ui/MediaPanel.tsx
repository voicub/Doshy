"use client";
import { PauseIcon, PlayIcon, PowerIcon, RepeatIcon, RepeatOnceIcon, ShuffleIcon, SkipBackIcon, SkipForwardIcon, StopIcon } from "@phosphor-icons/react";
import { useMemo } from "react";
import { useAreas } from "@/lib/haAreas";
import { byline, groupByRoom, headline, isActive, isDead, isPlaying, listPlayers, positionAt, sortPlayers, type Player, type Repeat } from "@/lib/media";
import { useStore } from "@/lib/store";
import HudPanel from "./HudPanel";
import { Art, Progress, Volume } from "./MediaBits";
import { PROGRESS_TICK_MS, mediaCall, useMediaUi } from "./mediaUi";
import { useNow } from "../useNow";
import MonoLabel from "./MonoLabel";

const NEXT_REPEAT: Record<Repeat, Repeat> = { off: "all", all: "one", one: "off" };
const REPEAT_LABEL: Record<Repeat, string> = { off: "Repeat off", all: "Repeat all", one: "Repeat one" };

function Btn({ label, onClick, pressed, main, children }: { label: string; onClick: () => void; pressed?: boolean; main?: boolean; children: React.ReactNode }) {
  return <button className={`mp-btn ${main ? "main" : ""}`} aria-label={label} title={label} aria-pressed={pressed} onClick={onClick}>{children}</button>;
}

/** Shuffle, previous, play / pause (or stop for players that cannot pause), next, repeat: only what the player supports. */
function Transport({ p, now }: { p: Player; now: number }) {
  const f = p.features;
  const playing = isPlaying(p);
  const pos = () => ({ media_position: positionAt(p, now), media_position_updated_at: new Date().toISOString() });
  const toggle = () => (playing ? void mediaCall(p.id, "media_pause", undefined, { state: "paused", attrs: pos() }) : void mediaCall(p.id, "media_play", undefined, { state: "playing", attrs: pos() }));
  const canToggle = playing ? f.pause : f.play;
  const stopOnly = playing && !f.pause && f.stop;
  const repeat = p.repeat ?? "off";
  if (!(f.previous || canToggle || stopOnly || f.next || f.shuffle || f.repeat)) return null;
  return (
    <div className="mp-transport">
      {f.shuffle && <Btn label="Shuffle" pressed={p.shuffle === true} onClick={() => void mediaCall(p.id, "shuffle_set", { shuffle: !p.shuffle }, { attrs: { shuffle: !p.shuffle } })}><ShuffleIcon size={16} /></Btn>}
      {f.previous && <Btn label="Previous" onClick={() => void mediaCall(p.id, "media_previous_track")}><SkipBackIcon size={18} /></Btn>}
      {stopOnly ? (
        <Btn main label="Stop" onClick={() => void mediaCall(p.id, "media_stop", undefined, { state: "idle" })}><StopIcon size={20} /></Btn>
      ) : (
        canToggle && <Btn main label={playing ? "Pause" : "Play"} onClick={toggle}>{playing ? <PauseIcon size={20} /> : <PlayIcon size={20} />}</Btn>
      )}
      {f.next && <Btn label="Next" onClick={() => void mediaCall(p.id, "media_next_track")}><SkipForwardIcon size={18} /></Btn>}
      {f.repeat && <Btn label={REPEAT_LABEL[repeat]} pressed={repeat !== "off"} onClick={() => void mediaCall(p.id, "repeat_set", { repeat: NEXT_REPEAT[repeat] }, { attrs: { repeat: NEXT_REPEAT[repeat] } })}>{repeat === "one" ? <RepeatOnceIcon size={16} /> : <RepeatIcon size={16} />}</Btn>}
    </div>
  );
}

/** Source and sound mode pickers, for players that offer them. */
function Selects({ p }: { p: Player }) {
  const f = p.features;
  const hasSource = f.source && p.sources.length > 0;
  const hasSound = f.soundMode && p.soundModes.length > 0;
  if (!hasSource && !hasSound) return null;
  return (
    <div className="mp-selects">
      {hasSource && (
        <label>
          <span className="label">Source</span>
          <select value={p.source ?? ""} onChange={(e) => void mediaCall(p.id, "select_source", { source: e.target.value }, { attrs: { source: e.target.value } })}>
            {!p.source && <option value="" disabled>Choose</option>}
            {p.sources.map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
      )}
      {hasSound && (
        <label>
          <span className="label">Sound</span>
          <select value={p.soundMode ?? ""} onChange={(e) => void mediaCall(p.id, "select_sound_mode", { sound_mode: e.target.value }, { attrs: { sound_mode: e.target.value } })}>
            {!p.soundMode && <option value="" disabled>Choose</option>}
            {p.soundModes.map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
      )}
    </div>
  );
}

/** Chips to join or leave a speaker group. */
function GroupChips({ p, mates }: { p: Player; mates: Player[] }) {
  return (
    <div className="mp-group">
      <span className="label">Play together with</span>
      <div className="mp-chips">
        {mates.map((o) => {
          const joined = p.group.includes(o.id);
          return (
            <button key={o.id} className="mp-chip" aria-pressed={joined} onClick={() => void (joined ? mediaCall(o.id, "unjoin") : mediaCall(p.id, "join", { group_members: [o.id] }))}>{o.name}</button>
          );
        })}
      </div>
    </div>
  );
}

function Card({ p, others }: { p: Player; others: Player[] }) {
  const now = useNow(PROGRESS_TICK_MS, isPlaying(p));
  const f = p.features;
  const title = headline(p) ?? (isActive(p) ? "Playing" : "Nothing playing");
  const sub = byline(p);
  const mates = others.filter((o) => o.features.grouping && o.id !== p.id);
  return (
    <article className="mp-card" data-state={p.state} aria-label={p.name}>
      <div className="mp-top">
        <Art p={p} size={64} />
        <div className="mp-text">
          <MonoLabel>{p.name}</MonoLabel>
          <div className="mp-title">{title}</div>
          {sub && <div className="mp-by">{sub}</div>}
        </div>
        {f.turnOff && <Btn label={`Turn ${p.name} off`} onClick={() => void mediaCall(p.id, "turn_off", undefined, { state: "off" })}><PowerIcon size={16} /></Btn>}
      </div>
      {p.duration > 0 && isActive(p) && <Progress p={p} now={now} />}
      <Transport p={p} now={now} />
      <Volume p={p} />
      <Selects p={p} />
      {f.grouping && mates.length > 0 && <GroupChips p={p} mates={mates} />}
    </article>
  );
}

function Row({ p }: { p: Player }) {
  const on = p.state !== "off" && p.state !== "standby";
  const canPower = on ? p.features.turnOff : p.features.turnOn;
  const last = headline(p);
  return (
    <li className="mp-row">
      <button className="mp-rowmain" onClick={() => useMediaUi.getState().show(p.id)} aria-label={`Open ${p.name}`}>
        <span className="mp-rowname">{p.name}</span>
        <span className="mp-rowsub">{last ?? p.state}</span>
      </button>
      {canPower && (
        <button className="mp-btn small" aria-label={`${on ? "Turn off" : "Turn on"} ${p.name}`} aria-pressed={on} title={on ? "Turn off" : "Turn on"} onClick={() => void mediaCall(p.id, on ? "turn_off" : "turn_on", undefined, { state: on ? "off" : "on" })}>
          <PowerIcon size={16} />
        </button>
      )}
    </li>
  );
}

/** What is playing in the home, and a control for each player. Opening it never starts anything. */
export default function MediaPanel() {
  const { open, focus, error, close } = useMediaUi();
  const states = useStore((s) => s.states);
  const { areas, entityArea } = useAreas();
  const all = useMemo(() => listPlayers(states), [states]);
  const live = all.filter((p) => !isDead(p));
  const cards = sortPlayers(live.filter((p) => isActive(p) || p.id === focus));
  const rest = sortPlayers(live.filter((p) => !cards.includes(p)));
  const dead = all.length - live.length;
  const playingCount = live.filter(isPlaying).length;
  const cardGroups = groupByRoom(cards, areas, entityArea);
  const restGroups = groupByRoom(rest, areas, entityArea);
  if (!open) return null;
  const heading = (name: string, show: boolean) => show && <MonoLabel className="mp-room">{name}</MonoLabel>;
  return (
    <HudPanel title="Media" meta={playingCount ? `${playingCount} playing` : "quiet"} onClose={close} className="mp sheet">
      <div className="mp-body">
        {error && <p className="mp-err" role="alert">{error}</p>}
        {Object.keys(states).length === 0 ? (
          <p className="mp-empty">Waiting for Home Assistant.</p>
        ) : live.length === 0 ? (
          <p className="mp-empty">No speakers or TVs are reachable right now.</p>
        ) : (
          <>
            {cards.length === 0 && <p className="mp-empty">Nothing is playing.</p>}
            {cardGroups.map((g) => (
              <section key={g.area ?? "none"} className="mp-sec">
                {heading(g.name, cardGroups.length > 1 || g.area !== null)}
                {g.players.map((p) => <Card key={p.id} p={p} others={live} />)}
              </section>
            ))}
            {rest.length > 0 && (
              <details className="mp-others" open={cards.length === 0}>
                <summary>Other players ({rest.length})</summary>
                {restGroups.map((g) => (
                  <section key={g.area ?? "none"} className="mp-sec">
                    {heading(g.name, restGroups.length > 1 || g.area !== null)}
                    <ul className="mp-list">{g.players.map((p) => <Row key={p.id} p={p} />)}</ul>
                  </section>
                ))}
              </details>
            )}
            {dead > 0 && <p className="mp-note">{dead} unavailable</p>}
          </>
        )}
      </div>
    </HudPanel>
  );
}
