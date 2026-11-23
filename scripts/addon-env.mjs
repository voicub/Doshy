// Maps the Home Assistant add-on options (/data/options.json) to the environment variables the server reads.
// docker-entrypoint.sh runs this (`node scripts/addon-env.mjs`) and evals the `export` lines it prints.
// Outside the add-on (plain Docker, Portainer) there is no options file and no SUPERVISOR_TOKEN: it prints nothing.
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** Add-on option -> environment variable. An empty option is skipped, so a variable set on the container still applies. */
export const OPTION_ENV = {
  ha_url: "HA_URL",
  ha_token: "HA_TOKEN",
  sketchfab_token: "SKETCHFAB_TOKEN",
  site_tile_url: "SITE_TILE_URL",
  site_tile_max_zoom: "SITE_TILE_MAX_ZOOM",
  site_tile_credit: "SITE_TILE_CREDIT",
};

/** The Supervisor's proxy of Home Assistant: REST at /core/api/*, WebSocket at /core/api/websocket (lib/haNotify.ts builds that from this base). */
export const SUPERVISOR_CORE_URL = "http://supervisor/core";

/**
 * The variables to set for these add-on options. `env` is the container's environment.
 * Without any Home Assistant address or token (option or variable) the Supervisor's proxy and token are used.
 */
export function addonEnv(options, env) {
  const out = {};
  for (const [option, name] of Object.entries(OPTION_ENV)) {
    const value = String(options[option] ?? "").trim();
    if (value) out[name] = value;
  }
  if (options.automation === false) out.HOUSEY_AUTOMATION = "off";
  const haGiven = out.HA_URL || out.HA_TOKEN || env.HA_URL || env.HA_TOKEN;
  if (env.SUPERVISOR_TOKEN && !haGiven) {
    out.HA_URL = SUPERVISOR_CORE_URL;
    out.HA_TOKEN = env.SUPERVISOR_TOKEN;
  }
  return out;
}

/** `export NAME='value'` lines for `eval` in sh: single quotes keep any character in a value (tokens, URLs) literal. */
export const shellExports = (vars) =>
  Object.entries(vars)
    .map(([name, value]) => `export ${name}='${value.replaceAll("'", "'\\''")}'`)
    .join("\n");

function main() {
  const file = process.env.DOSHY_OPTIONS ?? "/data/options.json";
  const options = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  const vars = addonEnv(options, process.env);
  // Dry run: only the names, never the values (they are secrets).
  if (process.argv.includes("--names")) console.log(`would set: ${Object.keys(vars).join(" ") || "(nothing)"}`);
  else if (Object.keys(vars).length) console.log(shellExports(vars));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
