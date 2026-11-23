"use client";
import { useState } from "react";
import type { HAState, ServiceCall } from "@/lib/ha";
import { plexActivity, type TvEntities } from "@/lib/plex";
import type { RemoteKey } from "./PlexParts";
import { patchState, runService, type ServiceData } from "./serviceActions";

/** The Plex card's commands. Each one sets `busy` while it runs and `error` when Home Assistant refuses; `after` runs only on success. */
export default function usePlexCommands(tv: TvEntities, on: boolean, remote: HAState | undefined) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const send = async (call: ServiceCall, after?: () => void) => {
    setBusy(true);
    const err = await runService(call);
    setBusy(false);
    setError(err);
    if (!err) after?.();
  };
  const mp = (entity: string | undefined, service: string, data?: ServiceData, after?: () => void) => entity && send({ domain: "media_player", service, entity_id: entity, data }, after);
  const key = (...command: RemoteKey[]) => tv.remote && send({ domain: "remote", service: "send_command", entity_id: tv.remote, data: { command } });

  const togglePower = () => {
    const { power, remote: remoteId } = tv;
    const service = on ? "turn_off" : "turn_on";
    const patchTo = (id: string) => () => patchState(id, {}, on ? "off" : "on");
    if (power) void mp(power, service, undefined, patchTo(power));
    else if (remoteId) void send({ domain: "remote", service, entity_id: remoteId }, patchTo(remoteId));
  };
  const openPlex = () => {
    if (!tv.remote) return;
    const activity = plexActivity(remote?.attributes);
    void (activity ? send({ domain: "remote", service: "turn_on", entity_id: tv.remote, data: { activity } }) : key("HOME"));
  };

  return { error, busy, mp, key, togglePower, openPlex };
}
