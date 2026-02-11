import { base64UrlDecode, base64UrlEncode } from "../../shared/base64url";

export const EDIT_COOKIE_NAME = "mp_edit_cap";
export const EDIT_COOKIE_TTL = 86_400;

export interface EditCookieOptions {
  docId: string;
}

export interface EditCookieAttributes {
  name: typeof EDIT_COOKIE_NAME;
  path: string;
  httpOnly: true;
  secure: true;
  sameSite: "Strict";
  maxAge: number;
}

export interface EditCookiePayload {
  docId: string;
  expiresAt: number;
}

export function editCookiePath(docId: string): string {
  return `/parties/doc-room/${docId}`;
}

export function buildEditCookieAttributes(
  options: EditCookieOptions
): EditCookieAttributes {
  return {
    name: EDIT_COOKIE_NAME,
    path: editCookiePath(options.docId),
    httpOnly: true,
    secure: true,
    sameSite: "Strict",
    maxAge: EDIT_COOKIE_TTL,
  };
}

const hmacKeyCache = new Map<string, CryptoKey>();

async function importHmacKey(secret: string): Promise<CryptoKey> {
  const cached = hmacKeyCache.get(secret);
  if (cached) {
    return cached;
  }
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
  hmacKeyCache.set(secret, key);
  return key;
}

export async function signEditCookie(
  payload: EditCookiePayload,
  secret: string
): Promise<string> {
  const data = new TextEncoder().encode(JSON.stringify(payload));
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, data);
  const sigB64 = base64UrlEncode(signature);
  const dataB64 = base64UrlEncode(data);
  return `${dataB64}.${sigB64}`;
}

export async function verifyEditCookie(
  cookieValue: string,
  docId: string,
  secret: string
): Promise<EditCookiePayload | null> {
  try {
    const [dataB64, sigB64] = cookieValue.split(".");
    if (!(dataB64 && sigB64)) {
      return null;
    }

    const data = base64UrlDecode(dataB64);
    const signature = base64UrlDecode(sigB64);
    const key = await importHmacKey(secret);
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      signature.buffer as ArrayBuffer,
      data.buffer as ArrayBuffer
    );

    if (!valid) {
      return null;
    }

    const payload: EditCookiePayload = JSON.parse(
      new TextDecoder().decode(data)
    );

    if (payload.docId !== docId) {
      return null;
    }
    if (payload.expiresAt < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
