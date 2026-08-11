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

# Rebasing onto upstream moves the lockfile; a build against stale node_modules
# fails on whatever dependency upstream added since.
bun install

echo "==> Building Superset $VERSION as $CSC_NAME"
export SUPERSET_ENV_FILE=../../.env.fork
# Stale artifacts from an earlier version otherwise get swept into the release
# by the asset globs below.
rm -rf apps/desktop/release
bun run --cwd apps/desktop compile:app
CSC_IDENTITY_AUTO_DISCOVERY=true bun run --cwd apps/desktop package -- --publish never

# An ad-hoc signature makes the app's designated requirement a cdhash of that
# exact binary, which no later build can satisfy — Squirrel then rejects every
# update. electron-builder falls back to ad-hoc silently when CSC_NAME doesn't
# resolve (missing cert, or two identities sharing the name), so fail here
# rather than after uploading half a gigabyte.
if codesign -dv --verbose=2 apps/desktop/release/mac-arm64/Superset.app 2>&1 |
	grep -q "Signature=adhoc"; then
	echo "✗ built app is ad-hoc signed — CSC_NAME=$CSC_NAME did not resolve" >&2
	echo "  check: security find-identity -v -p codesigning" >&2
	echo "  (a name matching two identities is ambiguous; pin the SHA-1 instead)" >&2
	exit 1
fi

# A build that packages cleanly can still fail to launch, and it does so
# silently: no window, no stderr, no crash report, exit 1. Start the app and
# require it to still be alive a few seconds later — the only check that has
# actually distinguished a good build from a bad one here.
APP_BIN="apps/desktop/release/mac-arm64/Superset.app/Contents/MacOS/Superset"
"$APP_BIN" >/dev/null 2>&1 &
APP_PID=$!
sleep 15
if ! kill -0 "$APP_PID" 2>/dev/null; then
	echo "✗ the built app exits immediately — do not publish it" >&2
	echo "  run it yourself to see: $APP_BIN" >&2
	exit 1
fi
kill "$APP_PID" 2>/dev/null || true
wait "$APP_PID" 2>/dev/null || true

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
