#!/bin/bash
cd "$(dirname "$0")/.."
echo "WARNING: full re-upload to R2"
read -r -p "Continue? [y/N] " a
[[ "$a" == "y" || "$a" == "Y" ]] || exit 0
npm run ops -- r2:force
echo
read -r -p "Press Enter to close..."
