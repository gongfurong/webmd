#!/bin/bash
cd "$(dirname "$0")/.."
npm run ops -- r2
echo
read -r -p "Press Enter to close..."
