#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../mobile"
echo "Installing mobile dependencies..."
npm install

echo "Building Android APK (preview) or AAB (production) via Expo EAS..."
PROFILE="${1:-preview}"
npx eas-cli build --platform android --profile "$PROFILE"
