#!/bin/sh
# Run the offline tests against the installed DeepSeek Harness runtime.
set -eu
cd "$(dirname "$0")/.."
app=${DSH_APP:-"/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness"}
ELECTRON_RUN_AS_NODE=1 exec "$app" --import ./test/dsh-resolve.mjs --test test/*.test.mjs
