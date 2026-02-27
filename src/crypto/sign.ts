import * as fs from "fs";
import * as path from "path";
import { generateKeyPairSync, sign, verify } from "crypto";

const DATA_DIR = path.resolve(process.cwd(), "data");
const KEYS_DIR = path.join(DATA_DIR, "keys");

// Fichiers très simples pour démarrer (on fera mieux plus tard)
const PRIV_PATH = path.join(KEYS_DIR, "ed25519.priv.pem");
const PUB_PATH = path.join(KEYS_DIR, "ed25519.pub.pem");

const REG_PATH = path.join(KEYS_DIR, "registry.json");

type Registry = {
  active: string;
  keys: Record<string, { origin: string; alg: "ed25519"; pubPath: string }>;
};

function ensureRegistry() {
  ensureKeysDir();
  if (!fs.existsSync(REG_PATH)) {
    const origin = "default";
    const keyId = `${origin}#ed25519-1`;
    const reg: Registry = {
      active: keyId,
      keys: {
        [keyId]: { origin, alg: "ed25519", pubPath: "data/keys/ed25519.pub.pem" },
      },
    };
    fs.writeFileSync(REG_PATH, JSON.stringify(reg, null, 2), "utf8");
  }
}

export function getActiveKeyId(): string {
  ensureRegistry();
  const reg = JSON.parse(fs.readFileSync(REG_PATH, "utf8")) as Registry;
  return reg.active;
}

export function getPublicKeyPemForKeyId(keyId: string): string {
  ensureRegistry();
  const reg = JSON.parse(fs.readFileSync(REG_PATH, "utf8")) as Registry;
  const entry = reg.keys[keyId];
  if (!entry) throw new Error(`Unknown keyId: ${keyId}`);
  const pubAbs = path.resolve(process.cwd(), entry.pubPath);
  return fs.readFileSync(pubAbs, "utf8");
}

function ensureKeysDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(KEYS_DIR)) fs.mkdirSync(KEYS_DIR, { recursive: true });
}

/**
 * Génère une paire de clés Ed25519 si elle n'existe pas.
 * Stockage local (POC). On améliorera la gestion (keyId, rotation) ensuite.
 */
export function ensureEd25519Keypair() {
  ensureKeysDir();

  const privExists = fs.existsSync(PRIV_PATH);
  const pubExists = fs.existsSync(PUB_PATH);
  if (privExists && pubExists) return;

  const { privateKey, publicKey } = generateKeyPairSync("ed25519");

  fs.writeFileSync(PRIV_PATH, privateKey.export({ format: "pem", type: "pkcs8" }) as string, "utf8");
  fs.writeFileSync(PUB_PATH, publicKey.export({ format: "pem", type: "spki" }) as string, "utf8");
}

export function signBase64(message: string): string {
  ensureEd25519Keypair();
  const privateKeyPem = fs.readFileSync(PRIV_PATH, "utf8");
  const sig = sign(null, Buffer.from(message, "utf8"), privateKeyPem);
  return sig.toString("base64");
}

export function verifyBase64(message: string, signatureB64: string): boolean {
  ensureEd25519Keypair();
  const publicKeyPem = fs.readFileSync(PUB_PATH, "utf8");
  return verify(null, Buffer.from(message, "utf8"), publicKeyPem, Buffer.from(signatureB64, "base64"));
}

export function verifyBase64WithPublicKey(message: string, signatureB64: string, publicKeyPem: string): boolean {
  return verify(null, Buffer.from(message, "utf8"), publicKeyPem, Buffer.from(signatureB64, "base64"));
}