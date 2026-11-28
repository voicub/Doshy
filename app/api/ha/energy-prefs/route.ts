import { MAX_HOMES } from "@/lib/db/connections";
import { errorMessage } from "@/lib/guards";
import { HaWebSocket, allowHome, haFailure, resolveHa, type HaHome } from "@/lib/haServer";
import { HttpError } from "@/lib/db/errors";
import { readEnergyPrefs, type EnergyGuess } from "@/lib/energyPrefs";
import { ttlCache } from "@/lib/server/ttlCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Each uncached read opens a WebSocket to Home Assistant; the setup rarely changes, so a minute is plenty. One entry per home.
const cache = ttlCache<EnergyGuess>(60_000, MAX_HOMES + 1);

async function load(home: HaHome): Promise<EnergyGuess> {
  await allowHome(home);
  return readEnergyPrefs(home.baseUrl, home.token, HaWebSocket);
}

/** The sensors named in Home Assistant's Energy dashboard setup (read-only, cached 60 s). `{ guess: null }` when HA cannot be asked, so the caller falls back to name guesses. */
export async function GET(req: Request) {
  try {
    const home = resolveHa(req);
    return Response.json({ guess: await cache.get(home.id, () => load(home)) });
  } catch (e) {
    if (e instanceof HttpError) return haFailure(e); // an unknown home is not "HA cannot be asked"
    console.error("energy-prefs:", errorMessage(e));
    return Response.json({ guess: null });
  }
}
