import { Hono } from "hono";
import { joyful } from "joyful";
import {
  buildEditCookieAttributes,
  EDIT_COOKIE_TTL,
  signEditCookie,
} from "../../src/shared/edit-cookie";
import { authMiddleware } from "../shared/auth-middleware";

interface Env {
  Bindings: {
    DOC_ROOM: DurableObjectNamespace;
    SESSION_KV: KVNamespace;
    GITHUB_CLIENT_ID: string;
    GITHUB_CLIENT_SECRET: string;
    JWT_SECRET: string;
    ENCRYPTION_KEY_V1: string;
  };
  Variables: {
    userId: string;
    login: string;
    avatarUrl: string;
  };
}

interface DocMeta {
  initialized: boolean;
  docId: string;
  ownerUserId: string | null;
  editTokenHash: string;
  githubBackend: string | null;
  createdAt: string;
  lastActivityAt: string;
}

const SESSION_COOKIE_REGEX = /__session=([^;]+)/;

function createDoRequest(
  docId: string,
  path: string,
  options?: RequestInit
): Request {
  return new Request(`https://do${path}`, {
    ...options,
    headers: {
      ...options?.headers,
      "x-partykit-room": docId,
    },
  });
}

async function generateEditToken(): Promise<{ token: string; hash: string }> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);

  const token = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");

  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return { token, hash };
}

function generateDocId(): string {
  // Use 3 segments for ~2.1 billion combinations
  return joyful({ segments: 3 });
}

const docRoutes = new Hono<Env>();

// POST /api/docs - Create a new document (no auth required)
docRoutes.post("/", async (c) => {
  const docId = generateDocId();
  const { token: editToken, hash: editTokenHash } = await generateEditToken();

  // Get owner user ID if authenticated
  let ownerUserId: string | undefined;
  const sessionCookie = c.req
    .header("cookie")
    ?.match(SESSION_COOKIE_REGEX)?.[1];
  if (sessionCookie) {
    try {
      const { verifyJwt } = await import("../../src/shared/jwt");
      const claims = await verifyJwt(sessionCookie, {
        secret: c.env.JWT_SECRET,
        expiresInSeconds: 3600,
        audience: "markdown.party",
        issuer: "markdown.party",
      });
      ownerUserId = claims.userId;
    } catch {
      // Not authenticated - create anonymous doc
    }
  }

  const stub = c.env.DOC_ROOM.get(c.env.DOC_ROOM.idFromName(docId));
  await stub.fetch(
    createDoRequest(docId, "/initialize", {
      method: "POST",
      body: JSON.stringify({
        docId,
        ownerUserId,
        editTokenHash,
      }),
      headers: { "Content-Type": "application/json" },
    })
  );

  // Set edit capability cookie
  const cookiePayload = {
    docId,
    expiresAt: Math.floor(Date.now() / 1000) + EDIT_COOKIE_TTL,
  };
  const cookieValue = await signEditCookie(cookiePayload, c.env.JWT_SECRET);
  const attrs = buildEditCookieAttributes({ docId });

  const cookieParts = [
    `${attrs.name}=${cookieValue}`,
    `Path=${attrs.path}`,
    `Max-Age=${attrs.maxAge}`,
    "HttpOnly",
    "Secure",
    `SameSite=${attrs.sameSite}`,
  ];

  return c.json({ doc_id: docId, edit_token: editToken }, 201, {
    "Set-Cookie": cookieParts.join("; "),
  });
});

// POST /api/docs/:doc_id/claim - Exchange edit token for edit cookie
docRoutes.post("/:doc_id/claim", async (c) => {
  const docId = c.req.param("doc_id");
  const body = await c.req.json<{ token: string }>();

  const base64url = body.token;
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(base64 + padding);
  const bytes = new Uint8Array([...binary].map((ch) => ch.charCodeAt(0)));

  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const tokenHash = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const stub = c.env.DOC_ROOM.get(c.env.DOC_ROOM.idFromName(docId));
  const verifyRes = await stub.fetch(
    createDoRequest(docId, "/verify-token", {
      method: "POST",
      body: JSON.stringify({ tokenHash }),
      headers: { "Content-Type": "application/json" },
    })
  );
  const { valid } = (await verifyRes.json()) as { valid: boolean };

  if (!valid) {
    return c.json({ error: "Invalid edit token" }, 403);
  }

  const cookiePayload = {
    docId,
    expiresAt: Math.floor(Date.now() / 1000) + EDIT_COOKIE_TTL,
  };
  const cookieValue = await signEditCookie(cookiePayload, c.env.JWT_SECRET);
  const attrs = buildEditCookieAttributes({ docId });

  const cookieParts = [
    `${attrs.name}=${cookieValue}`,
    `Path=${attrs.path}`,
    `Max-Age=${attrs.maxAge}`,
    "HttpOnly",
    "Secure",
    `SameSite=${attrs.sameSite}`,
  ];

  return c.json({ ok: true }, 200, {
    "Set-Cookie": cookieParts.join("; "),
  });
});

// GET /api/docs/:doc_id - Get document metadata
docRoutes.get("/:doc_id", async (c) => {
  const docId = c.req.param("doc_id");
  const stub = c.env.DOC_ROOM.get(c.env.DOC_ROOM.idFromName(docId));

  const metaResponse = await stub.fetch(createDoRequest(docId, "/meta"));
  const meta = (await metaResponse.json()) as DocMeta;

  if (!meta.initialized) {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json({
    doc_id: meta.docId,
    owner_user_id: meta.ownerUserId,
    initialized: meta.initialized,
    created_at: meta.createdAt,
    last_activity_at: meta.lastActivityAt,
  });
});

// POST /api/docs/:doc_id/edit-token - Regenerate edit token (owner only)
docRoutes.post("/:doc_id/edit-token", authMiddleware, async (c) => {
  const docId = c.req.param("doc_id");
  const userId = c.get("userId");

  const stub = c.env.DOC_ROOM.get(c.env.DOC_ROOM.idFromName(docId));
  const metaRes = await stub.fetch(createDoRequest(docId, "/meta"));
  const meta = (await metaRes.json()) as DocMeta;

  if (!meta.initialized) {
    return c.json({ error: "Not found" }, 404);
  }
  if (meta.ownerUserId !== userId) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const { token: newToken, hash: newHash } = await generateEditToken();

  await stub.fetch(
    createDoRequest(docId, "/update-token", {
      method: "POST",
      body: JSON.stringify({ editTokenHash: newHash }),
      headers: { "Content-Type": "application/json" },
    })
  );

  return c.json({ edit_token: newToken });
});

// GET /:doc_id/raw - Get raw markdown (non-API route, mounted separately)
export async function handleRawDoc(
  c: { env: Env["Bindings"] },
  docId: string
): Promise<Response> {
  const stub = c.env.DOC_ROOM.get(c.env.DOC_ROOM.idFromName(docId));

  const metaResponse = await stub.fetch(createDoRequest(docId, "/meta"));
  const meta = (await metaResponse.json()) as DocMeta;

  if (!meta.initialized) {
    return new Response("Not found", { status: 404 });
  }

  // For Phase 1, return empty content (snapshot extraction needed for actual content)
  // In practice, this would need to fetch from the DO's stored markdown
  return new Response("", {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-cache",
    },
  });
}

export default docRoutes;
