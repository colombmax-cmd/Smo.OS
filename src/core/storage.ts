import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const STORAGE_ENV_VAR = "PLOS_STORAGE_DIR";
const LEGACY_DATA_PREFIX = "data/";

function defaultStorageRoot(): string {
  if (process.env.XDG_DATA_HOME) {
    return path.resolve(process.env.XDG_DATA_HOME, "plos", "shared-store");
  }

  return path.resolve(os.homedir(), ".local", "share", "plos", "shared-store");
}

export function getStorageRoot(): string {
  const configured = process.env[STORAGE_ENV_VAR];
  if (configured && configured.trim()) {
    return path.resolve(configured);
  }
  return defaultStorageRoot();
}

export function ensureStorageRoot() {
  fs.mkdirSync(getStorageRoot(), { recursive: true });
}

export function storagePath(...parts: string[]): string {
  return path.join(getStorageRoot(), ...parts);
}

export function storageFileUrl(...parts: string[]): string {
  return `file:///shared-store/${parts.join("/")}`;
}

export function resolveManagedPath(p: string): string {
  if (path.isAbsolute(p)) return p;
  if (p.startsWith(LEGACY_DATA_PREFIX)) {
    return storagePath(p.slice(LEGACY_DATA_PREFIX.length));
  }
  return storagePath(p);
}

export function toManagedPath(...parts: string[]): string {
  return path.join(...parts);
}

export function getStorageLabel(): string {
  return `PLOS shared store (${getStorageRoot()})`;
}
