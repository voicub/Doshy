#!/bin/sh
# Entrypoint of the Doshy image. The Home Assistant add-on, plain Docker and Portainer all start here.
#  - Add-on: /data/options.json and SUPERVISOR_TOKEN exist; scripts/addon-env.mjs turns them into HA_URL, HA_TOKEN, ... (see there).
#  - Docker / Portainer: nothing to map, the container's own environment is used as it is.
# DOSHY_DRY_RUN=1 prints the names of the variables that would be set (never their values) and exits.
set -eu
cd /app

if [ -n "${DOSHY_DRY_RUN:-}" ]; then
  exec node scripts/addon-env.mjs --names
fi

# A separate assignment: a failure here (unreadable options file) stops the script, which `eval "$(...)"` would hide.
vars=$(node scripts/addon-env.mjs)
eval "$vars"

# Docker starts as root only so a volume created by an older image can be handed to the unprivileged user; the server never runs as root there.
# The add-on stays root: its /data is owned by root, the Supervisor's container sandbox applies, and it is the norm for add-ons.
if [ "$(id -u)" = 0 ] && [ -z "${SUPERVISOR_TOKEN:-}" ]; then
  mkdir -p /data
  find /data ! -user node -exec chown node:node {} +
  exec setpriv --reuid=node --regid=node --init-groups node server.js
fi
exec node server.js
