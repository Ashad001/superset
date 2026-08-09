#!/bin/bash
# Build the desktop app from this fork and publish it as a GitHub release, so
# the installed Superset app auto-updates from here instead of upstream.
#
#   CSC_NAME="Superset Personal" scripts/release-fork.sh
#
# Requires: a self-signed code-signing identity in your login keychain (macOS
# refuses to auto-update an unsigned app), `gh auth login`, and a version in
# apps/desktop/package.json higher than the installed app's.
set -euo pipefail
cd "$(dirname "$0")/.."
shopt -s nullglob

REPO="${SUPERSET_FORK_REPO:-Ashad001/superset}"
: "${CSC_NAME:?set CSC_NAME to your signing identity (Keychain Access > Certificate Assistant)}"

VERSION="$(jq -r .version apps/desktop/package.json)"
INSTALLED="$(defaults read /Applications/Superset.app/Contents/Info.plist CFBundleShortVersionString 2>/dev/null || echo 0.0.0)"

# The updater compares versions, so a build at or below the installed version is
# silently ignored — fail loudly here instead.
if [ "$VERSION" = "$(printf '%s\n%s\n' "$VERSION" "$INSTALLED" | sort -V | head -1)" ]; then
	echo "✗ apps/desktop/package.json is $VERSION but $INSTALLED is installed — bump first" >&2
	echo "  (keep apps/desktop, packages/host-service and packages/cli in lockstep; bun run check:versions)" >&2
	exit 1
fi

bun run check:versions

echo "==> Building Superset $VERSION as $CSC_NAME"
export SUPERSET_ENV_FILE=../../.env.fork
bun run --cwd apps/desktop compile:app
CSC_IDENTITY_AUTO_DISCOVERY=true bun run --cwd apps/desktop package -- --publish never

# latest-mac.yml is the manifest the in-app updater fetches; without it in the
# release assets nothing updates.
ASSETS=(apps/desktop/release/latest-mac.yml apps/desktop/release/*.dmg apps/desktop/release/*.zip apps/desktop/release/*.blockmap)
if [ ! -e apps/desktop/release/latest-mac.yml ]; then
	echo "✗ no latest-mac.yml in apps/desktop/release — updater would have nothing to read" >&2
	exit 1
fi

echo "==> Publishing v$VERSION to $REPO"
gh release create "v$VERSION" "${ASSETS[@]}" \
	--repo "$REPO" \
	--title "Superset $VERSION" \
	--notes "Personal fork build of superset-sh/superset."
