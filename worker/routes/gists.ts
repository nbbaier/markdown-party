import { Hono } from "hono";
import { decrypt } from "../../src/shared/encryption";
import { authMiddleware } from "../shared/auth-middleware";

type Env = {
  Bindings: {
    GIST_ROOM: DurableObjectNamespace;
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
};

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

async function getDecryptedToken(
  kv: KVNamespace,
  userId: string,
  encryptionKey: string
): Promise<string> {
  const sessionData = await kv.get(`session:${userId}`);
  if (!sessionData) {
    throw new Error("Session not found");
  }

  const { encryptedToken } = JSON.parse(sessionData);
  return decrypt(encryptedToken, {
    currentKey: { version: 1, rawKey: encryptionKey },
    previousKeys: [],
  });
}

const gistRoutes = new Hono<Env>();

gistRoutes.post("/", authMiddleware, async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json<{
    filename?: string;
    description?: string;
    public?: boolean;
  }>();

  const filename = body.filename || "document.md";
  const description = body.description || "Created on gist.party";
  const isPublic = body.public ?? false;

  const token = await getDecryptedToken(
    c.env.SESSION_KV,
    userId,
    c.env.ENCRYPTION_KEY_V1
  );

  const ghResponse = await fetch("https://api.github.com/gists", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      description,
      public: isPublic,
      files: { [filename]: { content: "" } },
    }),
  });

  if (!ghResponse.ok) {
    return c.json({ error: "Failed to create gist" }, 502);
  }

  const gistData = (await ghResponse.json()) as { id: string };
  const gistId = gistData.id;

  const { token: editToken, hash: editTokenHash } = await generateEditToken();

  const stub = c.env.GIST_ROOM.get(c.env.GIST_ROOM.idFromName(gistId));
  await stub.fetch(
    new Request("https://do/initialize", {
      method: "POST",
      body: JSON.stringify({
        gistId,
        filename,
        ownerUserId: userId,
        editTokenHash,
      }),
      headers: { "Content-Type": "application/json" },
    })
  );

  return c.json({ gist_id: gistId, edit_token: editToken }, 201);
});

gistRoutes.post("/:gist_id/import", authMiddleware, async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json<{ url: string }>();

  const gistIdMatch = body.url.match(
    /(?:https?:\/\/gist\.github\.com\/[^/]+\/)?([a-f0-9]+)/
  );
  const sourceGistId = gistIdMatch ? gistIdMatch[1] : body.url;

  const token = await getDecryptedToken(
    c.env.SESSION_KV,
    userId,
    c.env.ENCRYPTION_KEY_V1
  );

  const ghResponse = await fetch(
    `https://api.github.com/gists/${sourceGistId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
      },
    }
  );

  if (!ghResponse.ok) {
    return c.json({ error: "Failed to fetch gist" }, 502);
  }

  const gistData = (await ghResponse.json()) as {
    id: string;
    files: Record<string, { filename: string; content: string }>;
  };

  const fileEntries = Object.values(gistData.files);
  if (fileEntries.length !== 1) {
    return c.json(
      { error: "Only single-file gists can be imported" },
      400
    );
  }

  const file = fileEntries[0];
  const filename = file.filename;
  const gistId = gistData.id;

  const { token: editToken, hash: editTokenHash } = await generateEditToken();

  const stub = c.env.GIST_ROOM.get(c.env.GIST_ROOM.idFromName(gistId));
  await stub.fetch(
    new Request("https://do/initialize", {
      method: "POST",
      body: JSON.stringify({
        gistId,
        filename,
        ownerUserId: userId,
        editTokenHash,
      }),
      headers: { "Content-Type": "application/json" },
    })
  );

  return c.json({ gist_id: gistId, edit_token: editToken }, 201);
});

gistRoutes.get("/:gist_id", async (c) => {
  const gistId = c.req.param("gist_id");
  const stub = c.env.GIST_ROOM.get(c.env.GIST_ROOM.idFromName(gistId));

  const metaResponse = await stub.fetch(new Request("https://do/meta"));
  const meta = (await metaResponse.json()) as {
    initialized: boolean;
    gistId: string;
    filename: string;
    ownerUserId: string;
    pendingSync: boolean;
    lastCanonicalMarkdown: string | null;
  };

  if (!meta.initialized) {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json({
    gist_id: meta.gistId,
    filename: meta.filename,
    owner_user_id: meta.ownerUserId,
    pending_sync: meta.pendingSync,
    initialized: meta.initialized,
  });
});

export default gistRoutes;
