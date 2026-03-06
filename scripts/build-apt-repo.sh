#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v dpkg-scanpackages >/dev/null 2>&1; then
  echo "dpkg-scanpackages is required (install dpkg-dev)." >&2
  exit 1
fi

if ! command -v apt-ftparchive >/dev/null 2>&1; then
  echo "apt-ftparchive is required (install apt-utils)." >&2
  exit 1
fi

REPO_DIR="${1:-$ROOT_DIR/dist/apt-repo}"
POOL_DIR="$REPO_DIR/pool/main"
DIST_DIR="$REPO_DIR/dists/stable/main/binary-amd64"

mkdir -p "$POOL_DIR" "$DIST_DIR"

if ! compgen -G "$ROOT_DIR/dist/apt/*.deb" >/dev/null; then
  echo "No .deb package found in dist/apt. Run scripts/build-deb.sh first." >&2
  exit 1
fi

cp -f "$ROOT_DIR"/dist/apt/*.deb "$POOL_DIR/"

pushd "$REPO_DIR" >/dev/null

dpkg-scanpackages --multiversion pool > dists/stable/main/binary-amd64/Packages
gzip -kf dists/stable/main/binary-amd64/Packages

cat > apt-release.conf <<CONF
APT::FTPArchive::Release {
  Origin "Smo.OS";
  Label "Smo.OS";
  Suite "stable";
  Codename "stable";
  Architectures "amd64";
  Components "main";
  Description "Smo.OS APT Repository";
};
CONF

apt-ftparchive -c=apt-release.conf release dists/stable > dists/stable/Release
rm -f apt-release.conf

popd >/dev/null

echo "APT repository generated at: $REPO_DIR"
