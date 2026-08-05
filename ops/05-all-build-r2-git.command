#!/bin/bash
cd "$(dirname "$0")/.."
npm run ops -- all
echo
read -r -p "Press Enter to close..."
