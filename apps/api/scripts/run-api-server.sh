#!/bin/bash
# Launched by com.stark.ifinances-api.plist (launchd LaunchAgent).
set -euo pipefail

cd "$(dirname "$0")/.."

pnpm run db:migrate
exec pnpm run start
