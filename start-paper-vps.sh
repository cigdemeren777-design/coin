#!/bin/sh
set -eu
cd "$(dirname "$0")"
command -v docker >/dev/null
command -v tailscale >/dev/null
command -v python3 >/dev/null

PAPER_PANEL_HOST=$(tailscale status --json | python3 -c '
import json, sys
status = json.load(sys.stdin)
if status.get("BackendState") != "Running":
    sys.exit("Önce Tailscale oturumunu açın.")
print(status["Self"]["DNSName"].rstrip("."))
')
export PAPER_PANEL_HOST
docker compose -f compose.paper.yml -f compose.paper.vps.yml up -d --build
tailscale serve --bg 8766
