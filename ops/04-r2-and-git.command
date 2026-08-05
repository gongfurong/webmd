#!/bin/bash
cd "$(dirname "$0")/.."
npm run ops -- ship
echo
read -r -p "Press Enter to close..."
