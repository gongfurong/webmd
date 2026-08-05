#!/bin/bash
cd "$(dirname "$0")/.."
echo "[ops] local dev — Ctrl+C to stop"
npm run ops -- dev
echo
read -r -p "Press Enter to close..."
