import { Hono } from "hono";
import { joyful } from "joyful";
import { decrypt } from "../../shared/encryption";
import { verifyJwt } from "../../shared/jwt";
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

interface GitHubBackend {
  type: "gist";
  gistId: string;
  filename: string;
  etag: string | null;
}

interface LinkGithubBody {
  gist_id?: string;
  filename?: string;
  public?: boolean;
}

interface GistOperationResult {
  gistId: string;
  filename: string;
  etag: string | null;
}

const SESSION_COOKIE_REGEX = /__session=([^;]+)/;
const DOC_ID_REGEX = /^[a-z]+-[a-z]+-[a-z]+$/;
const GIST_ID_REGEX = /^[a-f0-9]+$/i;
const FILENAME_REGEX = /^[\w\-. ]+$/;

function validateDocId(docId: string): boolean {
  return DOC_ID_REGEX.test(docId);
}

function validateGistId(gistId: string): boolean {
  return GIST_ID_REGEX.test(gistId);
}

function validateFilename(filename: string): boolean {
  return FILENAME_REGEX.test(filename);
}

function githubHeaders(
  accessToken: string,
  includeJsonContentType = false
): HeadersInit {
  if (includeJsonContentType) {
    return {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
      "User-Agent": "markdown.party",
    };
  }

  return {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "markdown.party",
  };
}

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

function validateGithubLinkBody(body: LinkGithubBody):
  | {
      gistId?: string;
      filename: string;
    }
  | {
      error: string;
    } {
  const gistId = body.gist_id;
  const filename = body.filename ?? "document.md";

  if (gistId && !validateGistId(gistId)) {
    return { error: "Invalid gist ID format" };
  }
  if (!validateFilename(filename)) {
    return { error: "Invalid filename" };
  }

  return { gistId, filename };
}

async function getGithubAccessToken(
  env: Env["Bindings"],
  userId: string
): Promise<string | null> {
  const sessionData = await env.SESSION_KV.get(`session:${userId}`);
  if (!sessionData) {
    return null;
  }

  const { encryptedToken } = JSON.parse(sessionData) as {
    encryptedToken: string;
  };

  return decrypt(encryptedToken, {
    currentKey: { version: 1, rawKey: env.ENCRYPTION_KEY_V1 },
    previousKeys: [],
  });
}

async function fetchExistingGist(
  accessToken: string,
  gistId: string,
  requestedFilename?: string
): Promise<GistOperationResult | null> {
  const gistRes = await fetch(`https://api.github.com/gists/${gistId}`, {
    headers: githubHeaders(accessToken),
  });

  if (!gistRes.ok) {
    return null;
  }

  const gistData = (await gistRes.json()) as {
    files: Record<string, { content: string }>;
  };
  const fileNames = Object.keys(gistData.files);
  if (!requestedFilename && fileNames.length === 0) {
    return null;
  }

  return {
    gistId,
    filename: requestedFilename ?? fileNames[0] ?? "document.md",
    etag: gistRes.headers.get("etag"),
  };
}

async function createNewGist(
  accessToken: string,
  filename: string,
  isPublic: boolean
): Promise<GistOperationResult | null> {
  const createRes = await fetch("https://api.github.com/gists", {
    method: "POST",
    headers: githubHeaders(accessToken, true),
    body: JSON.stringify({
      description: "Created with markdown.party",
      public: isPublic,
      files: {
        [filename]: {
          content: "",
        },
      },
    }),
  });

  if (!createRes.ok) {
    return null;
  }

  const createData = (await createRes.json()) as { id: string };

  return {
    gistId: createData.id,
    filename,
    etag: createRes.headers.get("etag"),
  };
}

function generateDocId(): string {
  // Use 3 segments for ~2.1 billion combinations
  return joyful({ segments: 3 });
}

const docRoutes = new Hono<Env>();

// POST /api/docs - Create a new document (no auth required)
docRoutes.post("/", async (c) => {
  const MAX_ID_RETRIES = 3;
  let docId = "";

  for (let attempt = 0; attempt < MAX_ID_RETRIES; attempt++) {
    docId = generateDocId();
    const stub = c.env.DOC_ROOM.get(c.env.DOC_ROOM.idFromName(docId));
    const metaRes = await stub.fetch(createDoRequest(docId, "/meta"));
    const meta = (await metaRes.json()) as DocMeta;
    if (!meta.initialized) {
      break;
    }
    if (attempt === MAX_ID_RETRIES - 1) {
      return c.json({ error: "Failed to generate unique document ID" }, 503);
    }
  }

  const { token: editToken, hash: editTokenHash } = await generateEditToken();

  let ownerUserId: string | undefined;
  const sessionCookie = c.req
    .header("cookie")
    ?.match(SESSION_COOKIE_REGEX)?.[1];
  if (sessionCookie) {
    try {
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
  if (!validateDocId(docId)) {
    return c.json({ error: "Invalid document ID" }, 400);
  }
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
  if (!validateDocId(docId)) {
    return c.json({ error: "Invalid document ID" }, 400);
  }
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
  if (!validateDocId(docId)) {
    return c.json({ error: "Invalid document ID" }, 400);
  }
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

// POST /api/docs/:doc_id/github - Link document to GitHub Gist (owner only)
docRoutes.post("/:doc_id/github", authMiddleware, async (c) => {
  const docId = c.req.param("doc_id");
  if (!validateDocId(docId)) {
    return c.json({ error: "Invalid document ID" }, 400);
  }
  const userId = c.get("userId");
  const body = await c.req.json<LinkGithubBody>();

  const stub = c.env.DOC_ROOM.get(c.env.DOC_ROOM.idFromName(docId));
  const metaRes = await stub.fetch(createDoRequest(docId, "/meta"));
  const meta = (await metaRes.json()) as DocMeta;

  if (!meta.initialized) {
    return c.json({ error: "Not found" }, 404);
  }
  if (meta.ownerUserId !== userId) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const accessToken = await getGithubAccessToken(c.env, userId);
  if (!accessToken) {
    return c.json({ error: "Session expired" }, 401);
  }

  const validatedLink = validateGithubLinkBody(body);
  if ("error" in validatedLink) {
    return c.json({ error: validatedLink.error }, 400);
  }

  const gistResult = validatedLink.gistId
    ? await fetchExistingGist(accessToken, validatedLink.gistId, body.filename)
    : await createNewGist(
        accessToken,
        validatedLink.filename,
        body.public ?? false
      );

  if (!gistResult) {
    if (validatedLink.gistId && !body.filename) {
      return c.json({ error: "Gist has no files" }, 400);
    }
    return c.json(
      {
        error: validatedLink.gistId
          ? "Failed to fetch Gist"
          : "Failed to create Gist",
      },
      validatedLink.gistId ? 400 : 500
    );
  }

  const backend: GitHubBackend = {
    type: "gist",
    gistId: gistResult.gistId,
    filename: gistResult.filename,
    etag: gistResult.etag,
  };

  // Update DO metadata
  await stub.fetch(
    createDoRequest(docId, "/update-github", {
      method: "POST",
      body: JSON.stringify({ githubBackend: backend }),
      headers: { "Content-Type": "application/json" },
    })
  );

  return c.json({
    gist_id: gistResult.gistId,
    filename: gistResult.filename,
    gist_url: `https://gist.github.com/${gistResult.gistId}`,
  });
});

// DELETE /api/docs/:doc_id/github - Unlink from GitHub (owner only)
docRoutes.delete("/:doc_id/github", authMiddleware, async (c) => {
  const docId = c.req.param("doc_id");
  if (!validateDocId(docId)) {
    return c.json({ error: "Invalid document ID" }, 400);
  }
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

  await stub.fetch(
    createDoRequest(docId, "/update-github", {
      method: "POST",
      body: JSON.stringify({ githubBackend: null }),
      headers: { "Content-Type": "application/json" },
    })
  );

  return c.json({ ok: true });
});

// GET /:doc_id/raw - Get raw markdown (non-API route, mounted separately)
export async function handleRawDoc(
  c: { env: Env["Bindings"] },
  docId: string
): Promise<Response> {
  const stub = c.env.DOC_ROOM.get(c.env.DOC_ROOM.idFromName(docId));

  // Fetch raw markdown from DO
  const rawResponse = await stub.fetch(
    createDoRequest(docId, "/raw", { method: "GET" })
  );

  if (!rawResponse.ok) {
    if (rawResponse.status === 404) {
      return new Response("Not found", { status: 404 });
    }
    return new Response("Failed to get content", { status: 500 });
  }

  const content = await rawResponse.text();

  return new Response(content, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-cache",
    },
  });
}

export default docRoutes;
