#!/bin/bash
# Screenshot sections of a template page with headless Chrome.
# Usage: render.sh <page.html> <width> <height> <id>=<out-path-without-extension> ...
# Writes <out>.png and an Instagram-ready <out>.jpg for each section id.
set -e
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
page="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"; w=$2; h=$3; shift 3
tmp=$(mktemp -d)
pids=()
for pair in "$@"; do
  id="${pair%%=*}"; out="${pair#*=}"; mkdir -p "$(dirname "$out")"; rm -f "$out.png"
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --no-first-run --no-default-browser-check \
    --disable-crash-reporter --disable-breakpad --force-device-scale-factor=1 \
    --window-size="$w,$h" --user-data-dir="$tmp/$id" --virtual-time-budget=8000 \
    --screenshot="$out.png" "file://$page#$id" >/dev/null 2>&1 &
  pids+=($!)
done
# This Chrome writes the screenshot but never exits, so wait for each file and close it ourselves.
i=0
for pair in "$@"; do
  out="${pair#*=}"
  for _ in $(seq 1 60); do [ -s "$out.png" ] && break; sleep 1; done
  sleep 1; kill "${pids[$i]}" 2>/dev/null || true; i=$((i+1))
  [ -s "$out.png" ] || { echo "render failed: $out" >&2; exit 1; }
  sips -s format jpeg -s formatOptions 92 "$out.png" --out "$out.jpg" >/dev/null
done
rm -rf "$tmp"
