import { base64UrlDecode, base64UrlEncode } from "./base64url";

export interface EncryptionKey {
  version: number;
  rawKey: string;
}

export interface EncryptionConfig {
  currentKey: EncryptionKey;
  previousKeys: EncryptionKey[];
}

export interface EncryptedBlob {
  version: number;
  iv: Uint8Array;
  ciphertext: Uint8Array;
}

const ENCRYPTED_BLOB_REGEX = /^v(\d+):(.+):(.+)$/;
const keyCache = new Map<string, CryptoKey>();

async function importAesKey(base64Key: string): Promise<CryptoKey> {
  const cached = keyCache.get(base64Key);
  if (cached) {
    return cached;
  }
  const keyData = base64UrlDecode(base64Key);
  const key = await crypto.subtle.importKey(
    "raw",
    keyData.buffer as ArrayBuffer,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
  keyCache.set(base64Key, key);
  return key;
}

function findKey(
  version: number,
  config: EncryptionConfig
): EncryptionKey | undefined {
  if (config.currentKey.version === version) {
    return config.currentKey;
  }
  return config.previousKeys.find((k) => k.version === version);
}

export function parseEncryptedBlob(encrypted: string): EncryptedBlob {
  const match = encrypted.match(ENCRYPTED_BLOB_REGEX);
  if (!match) {
    throw new Error("Invalid encrypted format");
  }

  const version = Number.parseInt(match[1], 10);
  const iv = base64UrlDecode(match[2]);
  const ciphertext = base64UrlDecode(match[3]);

  return { version, iv, ciphertext };
}

export function needsReEncryption(
  encrypted: string,
  config: EncryptionConfig
): boolean {
  try {
    const blob = parseEncryptedBlob(encrypted);
    return blob.version < config.currentKey.version;
  } catch {
    return true;
  }
}

export async function encrypt(
  plaintext: string,
  config: EncryptionConfig
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await importAesKey(config.currentKey.rawKey);
  const encoder = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(plaintext)
  );

  const ivB64 = base64UrlEncode(iv);
  const cipherB64 = base64UrlEncode(ciphertext);

  return `v${config.currentKey.version}:${ivB64}:${cipherB64}`;
}

export async function decrypt(
  encrypted: string,
  config: EncryptionConfig
): Promise<string> {
  const blob = parseEncryptedBlob(encrypted);
  const keySpec = findKey(blob.version, config);

  if (!keySpec) {
    throw new Error(`Unknown encryption version: ${blob.version}`);
  }

  const key = await importAesKey(keySpec.rawKey);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: blob.iv.buffer as ArrayBuffer },
    key,
    blob.ciphertext.buffer as ArrayBuffer
  );

  return new TextDecoder().decode(plaintext);
}
