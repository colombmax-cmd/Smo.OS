#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v dpkg-deb >/dev/null 2>&1; then
  echo "dpkg-deb is required (install dpkg)." >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required." >&2
  exit 1
fi

PKG_VERSION="${1:-$(jq -r '.version' package.json)}"
PKG_NAME="smo-os"
ARCH="all"
BUILD_ROOT="$ROOT_DIR/.build/deb"
PKG_ROOT="$BUILD_ROOT/${PKG_NAME}_${PKG_VERSION}"
OUT_DIR="$ROOT_DIR/dist/apt"
DEB_PATH="$OUT_DIR/${PKG_NAME}_${PKG_VERSION}_${ARCH}.deb"

rm -rf "$BUILD_ROOT"
mkdir -p "$PKG_ROOT/DEBIAN" "$PKG_ROOT/usr/lib/smo-os" "$PKG_ROOT/usr/bin" "$OUT_DIR"

npm ci
npm run build

cp -R dist "$PKG_ROOT/usr/lib/smo-os/"
cp package.json package-lock.json "$PKG_ROOT/usr/lib/smo-os/"
cp -R docs "$PKG_ROOT/usr/lib/smo-os/"
cp README.md LICENSE "$PKG_ROOT/usr/lib/smo-os/"

npm ci --omit=dev --prefix "$PKG_ROOT/usr/lib/smo-os"

cat > "$PKG_ROOT/usr/bin/smo-os" <<'LAUNCHER'
#!/usr/bin/env bash
set -euo pipefail
exec node /usr/lib/smo-os/dist/cli/index.js "$@"
LAUNCHER
chmod 755 "$PKG_ROOT/usr/bin/smo-os"

INSTALLED_SIZE="$(du -ks "$PKG_ROOT" | awk '{print $1}')"

cat > "$PKG_ROOT/DEBIAN/control" <<CONTROL
Package: ${PKG_NAME}
Version: ${PKG_VERSION}
Section: utils
Priority: optional
Architecture: ${ARCH}
Depends: nodejs (>= 18)
Maintainer: Smo.OS Maintainers <maintainers@smo-os.local>
Installed-Size: ${INSTALLED_SIZE}
Description: Smo.OS CLI and protocol tooling
 Smo.OS is an experimental Personal Life OS protocol implementation.
 This package installs the CLI and protocol tools.
CONTROL

chmod 755 "$PKG_ROOT/DEBIAN"

dpkg-deb --build "$PKG_ROOT" "$DEB_PATH"

echo "Built package: $DEB_PATH"
