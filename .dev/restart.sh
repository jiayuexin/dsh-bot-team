#!/bin/sh
# Dev-only: restart the isolated DSH web profile used to exercise this bundle.
set -eu
here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
port=${PORT:-4799}
for pid in $(lsof -nP -t -iTCP:"$port" -sTCP:LISTEN 2>/dev/null); do kill "$pid"; done
while lsof -nP -t -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; do sleep 0.5; done
mkdir -p "$here/logs"
export DSH_HOME="$here/home"
exec "/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" web --no-open --port "$port" >"$here/logs/web.log" 2>&1
