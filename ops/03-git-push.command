#!/bin/bash
cd "$(dirname "$0")/.."
npm run ops -- git
echo
read -r -p "Press Enter to close..."
