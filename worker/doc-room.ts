import type { Connection, ConnectionContext } from "partyserver";
import { YServer } from "y-partyserver";
// biome-ignore lint/performance/noNamespaceImport: yjs has many exports we need
import * as Y from "yjs";
import { verifyJwt } from "../shared/jwt";
import { verifyEditCookie } from "../src/shared/edit-cookie";
import {
  type CanonicalMarkdownPayload,
  type CustomMessage,
  decodeMessage,
  encodeMessage,
  MessageTypeCanonicalMarkdown,
  type SyncState,
} from "../src/shared/messages";

const EDIT_CAP_REGEXP = /mp_edit_cap=([^;]+)/;
const SESSION_COOKIE_REGEXP = /__session=([^;]+)/;
const ANONYMOUS_TTL_MS = 24 * 60 * 60 * 1000;

function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  if (aBytes.byteLength !== bBytes.byteLength) {
    return false;
  }
  return crypto.subtle.timingSafeEqual(aBytes, bBytes);
}

interface PendingMarkdownRequest {
  resolve: (markdown: string | null) => void;
  timeout: ReturnType<typeof setTimeout>;
}

interface WorkerEnv {
  DOC_ROOM: DurableObjectNamespace;
  SESSION_KV: KVNamespace;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  JWT_SECRET: string;
  ENCRYPTION_KEY_V1: string;
}

interface DocRoomMeta {
  initialized: boolean;
  docId: string;
  ownerUserId: string | null;
  editTokenHash: string;
  githubBackend: string | null;
  createdAt: string;
  lastActivityAt: string;
}

export class DocRoom extends YServer<WorkerEnv> {
  static options = {
    hibernate: true,
  };

  static callbackOptions = {
    debounceWait: 30_000,
    debounceMaxWait: 60_000,
  };

  static MAX_CONNECTIONS = 50;
  static MAX_MESSAGE_SIZE = 2 * 1024 * 1024;

  private readonly pendingMarkdownRequests = new Map<
    string,
    PendingMarkdownRequest
  >();
  private readonly connectionCapabilities = new Map<
    string,
    { canEdit: boolean; isOwner: boolean }
  >();

  private meta: DocRoomMeta | null = null;

  // ============================================================================
  // Lifecycle Methods
  // ============================================================================

  // biome-ignore lint/suspicious/useAwait: Called by framework
  async onStart(): Promise<void> {
    this.ensureSchema();
  }

  async onLoad(): Promise<void> {
    this.pendingMarkdownRequests.clear();
    this.connectionCapabilities.clear();
    this.meta = null;

    this.ensureSchema();
    this.loadMeta();

    const snapshot = this.loadSnapshot();
    if (snapshot) {
      Y.applyUpdate(this.document, snapshot.data);
    }

    await this.checkAndScheduleTtlAlarm();
  }

  async alarm(): Promise<void> {
    const connections = Array.from(this.getConnections());
    if (connections.length > 0) {
      await this.scheduleTtlAlarm();
      return;
    }

    const meta = this.getMeta();
    if (!meta) {
      await this.ctx.storage.deleteAll();
      return;
    }

    if (!meta.ownerUserId) {
      const lastActivity = new Date(meta.lastActivityAt).getTime();
      const now = Date.now();
      if (now - lastActivity >= ANONYMOUS_TTL_MS) {
        await this.ctx.storage.deleteAll();
        return;
      }
    }

    if (!meta.ownerUserId) {
      await this.scheduleTtlAlarm();
    }
  }

  private syncBackoffAttempt = 0;
  private syncBackoffTimer: ReturnType<typeof setTimeout> | null = null;

  async onSave(): Promise<void> {
    const snapshot = Y.encodeStateAsUpdate(this.document);
    this.saveSnapshot(snapshot);

    // Update last activity
    const meta = this.getMeta();
    if (meta) {
      meta.lastActivityAt = new Date().toISOString();
      this.setMeta(meta);
    }

    // Phase 2: GitHub sync
    await this.syncToGitHub();
  }

  private async syncToGitHub(): Promise<void> {
    const meta = this.getMeta();
    if (!meta?.githubBackend) {
      return; // No GitHub backend configured
    }

    // Check if owner is connected
    const ownerConnection = this.findOwnerConnection();
    if (!ownerConnection) {
      this.broadcastSyncStatus("pending-sync");
      return;
    }

    // Request canonical markdown from owner
    const markdown = await this.requestCanonicalMarkdown(ownerConnection);
    if (!markdown) {
      return;
    }

    // Sync to GitHub
    await this.writeToGitHub(meta, markdown);
  }

  private findOwnerConnection(): Connection | null {
    for (const [connectionId, caps] of this.connectionCapabilities.entries()) {
      if (caps.isOwner) {
        const connection = Array.from(this.getConnections()).find(
          (c) => c.id === connectionId
        );
        if (connection) {
          return connection;
        }
      }
    }
    return null;
  }

  private requestCanonicalMarkdown(
    connection: Connection
  ): Promise<string | null> {
    const requestId = crypto.randomUUID();

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.pendingMarkdownRequests.delete(requestId);
        resolve(null);
      }, 5000);

      this.pendingMarkdownRequests.set(requestId, {
        resolve: (markdown) => {
          clearTimeout(timeout);
          resolve(markdown);
        },
        timeout,
      });

      // Send request to specific connection
      connection.send(
        JSON.stringify({
          type: "request-markdown",
          payload: { requestId },
        })
      );
    });
  }

  private async writeToGitHub(
    meta: DocRoomMeta,
    markdown: string
  ): Promise<void> {
    if (!meta.githubBackend) {
      return;
    }

    const backend = this.parseGitHubBackend(meta.githubBackend);
    if (!backend || backend.type !== "gist") {
      return;
    }

    const accessToken = await this.getGitHubToken(meta);
    if (!accessToken) {
      return;
    }

    // Build headers for conditional write
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
      "User-Agent": "markdown.party",
    };

    if (backend.etag) {
      headers["If-Match"] = backend.etag;
    }

    this.broadcastSyncStatus("saving");

    try {
      const response = await fetch(
        `https://api.github.com/gists/${backend.gistId}`,
        {
          method: "PATCH",
          headers,
          body: JSON.stringify({
            files: {
              [backend.filename]: {
                content: markdown,
              },
            },
          }),
        }
      );

      if (response.status === 412) {
        await this.handleRemoteChanged(backend, accessToken);
        return;
      }

      if (!response.ok) {
        await this.handleSyncError(response.status);
        return;
      }

      // Success
      this.syncBackoffAttempt = 0;

      const newEtag = response.headers.get("etag");
      backend.etag = newEtag;
      meta.githubBackend = JSON.stringify(backend);
      this.setMeta(meta);

      this.broadcastSyncStatus("saved");
    } catch {
      await this.scheduleRetry();
    }
  }

  private async getGitHubToken(meta: DocRoomMeta): Promise<string | null> {
    if (!meta.ownerUserId) {
      return null;
    }

    const sessionData = await this.env.SESSION_KV.get(
      `session:${meta.ownerUserId}`
    );
    if (!sessionData) {
      this.broadcastSyncStatus("pending-sync", "Owner session expired");
      return null;
    }

    const parsedSession = this.parseSessionData(sessionData);
    if (!parsedSession) {
      this.broadcastSyncStatus("pending-sync", "Invalid session data");
      return null;
    }
    const { decrypt } = await import("../shared/encryption");
    return decrypt(parsedSession.encryptedToken, {
      currentKey: { version: 1, rawKey: this.env.ENCRYPTION_KEY_V1 },
      previousKeys: [],
    });
  }

  private async handleRemoteChanged(
    backend: { type: "gist"; gistId: string; filename: string },
    accessToken: string
  ): Promise<void> {
    const remoteRes = await fetch(
      `https://api.github.com/gists/${backend.gistId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "markdown.party",
        },
      }
    );

    if (remoteRes.ok) {
      const remoteData = await this.parseGistResponse(remoteRes);
      if (!remoteData) {
        return;
      }
      const remoteMarkdown = remoteData.files[backend.filename]?.content ?? "";

      this.broadcastMessage({
        type: "remote-changed",
        payload: { remoteMarkdown },
      });
    }

    this.syncBackoffAttempt = 0;
  }

  private handleSyncError(status: number): void {
    const isRetryable = status === 403 || status === 429 || status >= 500;

    if (!isRetryable || this.syncBackoffAttempt >= 5) {
      this.broadcastSyncStatus("error-retrying", `GitHub error: ${status}`);
      return;
    }

    this.syncBackoffAttempt++;
    const delay = Math.min(30_000, 2 ** this.syncBackoffAttempt * 1000);
    const nextRetryAt = Date.now() + delay;

    this.broadcastMessage({
      type: "error-retrying",
      payload: { attempt: this.syncBackoffAttempt, nextRetryAt },
    });

    if (this.syncBackoffTimer) {
      clearTimeout(this.syncBackoffTimer);
    }
    this.syncBackoffTimer = setTimeout(() => {
      this.syncToGitHub();
    }, delay);
  }

  private scheduleRetry(): void {
    if (this.syncBackoffAttempt >= 5) {
      return;
    }

    this.syncBackoffAttempt++;
    const delay = Math.min(30_000, 2 ** this.syncBackoffAttempt * 1000);
    const nextRetryAt = Date.now() + delay;

    this.broadcastMessage({
      type: "error-retrying",
      payload: { attempt: this.syncBackoffAttempt, nextRetryAt },
    });

    if (this.syncBackoffTimer) {
      clearTimeout(this.syncBackoffTimer);
    }
    this.syncBackoffTimer = setTimeout(() => {
      this.syncToGitHub();
    }, delay);
  }

  private broadcastSyncStatus(state: SyncState, detail?: string): void {
    this.broadcastMessage({
      type: "sync-status",
      payload: { state, detail },
    });
  }

  private broadcastMessage(message: CustomMessage): void {
    const msg = encodeMessage(message);
    for (const connection of this.getConnections()) {
      connection.send(msg);
    }
  }

  async onConnect(
    connection: Connection,
    ctx: ConnectionContext
  ): Promise<void> {
    const currentConnections = Array.from(this.getConnections()).length;
    if (currentConnections >= DocRoom.MAX_CONNECTIONS) {
      connection.close(4005, "Room is at capacity");
      return;
    }

    const meta = this.getMeta();
    if (!meta?.initialized) {
      connection.close(4004, "Room not initialized");
      return;
    }

    const [canEdit, isOwner] = await Promise.all([
      this.checkEditCapability(ctx),
      this.checkOwner(ctx),
    ]);
    this.connectionCapabilities.set(connection.id, { canEdit, isOwner });

    // Update activity on edit connection
    if (canEdit) {
      meta.lastActivityAt = new Date().toISOString();
      this.setMeta(meta);
    }
  }

  async onClose(
    connection: Connection,
    _code: number,
    _reason: string,
    _wasClean: boolean
  ): Promise<void> {
    this.connectionCapabilities.delete(connection.id);

    // Schedule TTL check when last connection leaves for anonymous docs
    const meta = this.getMeta();
    if (meta && !meta.ownerUserId) {
      const connections = Array.from(this.getConnections()).filter(
        (c) => c.id !== connection.id
      );
      if (connections.length === 0) {
        await this.scheduleTtlAlarm();
      }
    }
  }

  async onMessage(
    connection: Connection,
    message: string | ArrayBuffer
  ): Promise<void> {
    const messageBytes =
      typeof message === "string"
        ? new TextEncoder().encode(message).length
        : message.byteLength;

    if (messageBytes > DocRoom.MAX_MESSAGE_SIZE) {
      connection.close(4009, "Message too large");
      return;
    }

    // Only edit-capable connections can send messages
    const caps = this.connectionCapabilities.get(connection.id);
    if (!caps?.canEdit) {
      return;
    }

    // Handle custom messages
    if (typeof message === "string") {
      try {
        const customMessage = decodeMessage(message);

        // Discriminated union narrowing for message handling
        switch (customMessage.type) {
          case MessageTypeCanonicalMarkdown: {
            this.handleCanonicalMarkdown(connection, customMessage.payload);
            break;
          }
          case "push-local": {
            // Owner chooses to push local state to GitHub (force overwrite)
            if (caps.isOwner) {
              this.handlePushLocal();
            }
            break;
          }
          case "discard-local": {
            // Owner chooses to discard local and reload from GitHub
            if (caps.isOwner) {
              await this.handleDiscardLocal();
            }
            break;
          }
          default: {
            // Ignore other message types
            break;
          }
        }
      } catch (error) {
        // Broadcast error to client so UI can react
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        this.broadcastSyncStatus(
          "error-retrying",
          `Message processing failed: ${errorMessage}`
        );
      }
    }
  }

  // ============================================================================
  // HTTP API (for DO internal requests)
  // ============================================================================

  // biome-ignore lint/suspicious/useAwait: Called by framework (TODO: improve this)
  async onRequest(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;

    // Route to appropriate handler
    if (path === "/meta") {
      return this.handleMetaRequest();
    }

    if (path === "/initialize" && req.method === "POST") {
      return this.handleInitializeRequest(req);
    }

    if (path === "/verify-token" && req.method === "POST") {
      return this.handleVerifyTokenRequest(req);
    }

    if (path === "/update-token" && req.method === "POST") {
      return this.handleUpdateTokenRequest(req);
    }

    if (path === "/update-github" && req.method === "POST") {
      return this.handleUpdateGitHubRequest(req);
    }

    if (path === "/raw" && req.method === "GET") {
      return this.handleRawRequest();
    }

    return new Response("Not found", { status: 404 });
  }

  private handleMetaRequest(): Response {
    const meta = this.getMeta();
    if (!meta) {
      return new Response(
        JSON.stringify({
          initialized: false,
          docId: this.name,
          ownerUserId: null,
          editTokenHash: "",
          githubBackend: null,
          createdAt: "",
          lastActivityAt: "",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    return new Response(JSON.stringify(meta), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  private async handleInitializeRequest(req: Request): Promise<Response> {
    const body = await this.parseInitializeBody(req);
    if (!body) {
      return new Response(JSON.stringify({ error: "Invalid request body" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const now = new Date().toISOString();
    const newMeta: DocRoomMeta = {
      initialized: true,
      docId: body.docId,
      ownerUserId: body.ownerUserId ?? null,
      editTokenHash: body.editTokenHash,
      githubBackend: null,
      createdAt: now,
      lastActivityAt: now,
    };

    this.setMeta(newMeta);

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  private async handleVerifyTokenRequest(req: Request): Promise<Response> {
    const body = await this.parseVerifyTokenBody(req);
    if (!body) {
      return new Response(JSON.stringify({ error: "Invalid request body" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    const meta = this.getMeta();

    let valid = false;
    if (meta?.editTokenHash) {
      valid = timingSafeEqual(meta.editTokenHash, body.tokenHash);
    }
    return new Response(JSON.stringify({ valid }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  private async handleUpdateTokenRequest(req: Request): Promise<Response> {
    const body = await this.parseUpdateTokenBody(req);
    if (!body) {
      return new Response(JSON.stringify({ error: "Invalid request body" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    const meta = this.getMeta();

    if (!meta) {
      return new Response(JSON.stringify({ error: "Not initialized" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    meta.editTokenHash = body.editTokenHash;
    this.setMeta(meta);

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  private async handleUpdateGitHubRequest(req: Request): Promise<Response> {
    const body = await this.parseUpdateGitHubBody(req);
    if (!body) {
      return new Response(JSON.stringify({ error: "Invalid request body" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    const meta = this.getMeta();

    if (!meta) {
      return new Response(JSON.stringify({ error: "Not initialized" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    meta.githubBackend = body.githubBackend
      ? JSON.stringify(body.githubBackend)
      : null;
    this.setMeta(meta);

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // ============================================================================
  // Database / Storage
  // ============================================================================

  private ensureSchema(): void {
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS room_meta (
        key TEXT PRIMARY KEY,
        value TEXT
      )
    `);
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS yjs_snapshot (
        id INTEGER PRIMARY KEY,
        data BLOB,
        updated_at TEXT
      )
    `);
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS canonical_markdown (
        id INTEGER PRIMARY KEY,
        content TEXT,
        updated_at TEXT
      )
    `);
  }

  private loadMeta(): void {
    try {
      const result = this.ctx.storage.sql.exec(
        "SELECT value FROM room_meta WHERE key = 'meta'"
      );
      const row = result.one() as { value: string } | null;
      if (row?.value && typeof row.value === "string") {
        const parsed = JSON.parse(row.value);
        if (this.isValidDocRoomMeta(parsed)) {
          this.meta = parsed;
        }
      }
    } catch {
      this.meta = null;
    }
  }

  private getMeta(): DocRoomMeta | null {
    return this.meta;
  }

  private setMeta(meta: DocRoomMeta): void {
    this.meta = meta;
    this.ctx.storage.sql.exec(
      `INSERT OR REPLACE INTO room_meta (key, value) VALUES ('meta', ?)`,
      JSON.stringify(meta)
    );
  }

  private loadSnapshot(): { data: Uint8Array; updatedAt: string } | null {
    try {
      const result = this.ctx.storage.sql.exec(
        "SELECT data, updated_at FROM yjs_snapshot WHERE id = 1"
      );
      const row = result.one() as {
        data: ArrayBuffer;
        updated_at: string;
      } | null;
      if (row?.data) {
        return {
          data: new Uint8Array(row.data),
          updatedAt: row.updated_at,
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  private saveSnapshot(data: Uint8Array): void {
    this.ctx.storage.sql.exec(
      `INSERT OR REPLACE INTO yjs_snapshot (id, data, updated_at) 
       VALUES (1, ?, datetime('now'))`,
      data
    );
  }

  private saveCanonicalMarkdown(content: string): void {
    this.ctx.storage.sql.exec(
      `INSERT OR REPLACE INTO canonical_markdown (id, content, updated_at) 
       VALUES (1, ?, datetime('now'))`,
      content
    );
  }

  private loadCanonicalMarkdown(): string | null {
    try {
      const result = this.ctx.storage.sql.exec(
        "SELECT content FROM canonical_markdown WHERE id = 1"
      );
      const row = result.one() as { content: string } | null;
      return row?.content ?? null;
    } catch {
      return null;
    }
  }

  private handleRawRequest(): Response {
    const meta = this.getMeta();
    if (!meta?.initialized) {
      return new Response("Not found", { status: 404 });
    }

    const markdown = this.loadCanonicalMarkdown();

    return new Response(markdown ?? "", {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  // ============================================================================
  // TTL / Alarm
  // ============================================================================

  private async checkAndScheduleTtlAlarm(): Promise<void> {
    const meta = this.getMeta();
    if (!meta || meta.ownerUserId) {
      return; // No alarm for persistent docs
    }

    const lastActivity = new Date(meta.lastActivityAt).getTime();
    const elapsed = Date.now() - lastActivity;
    const remaining = Math.max(0, ANONYMOUS_TTL_MS - elapsed);

    if (remaining <= 0) {
      // Already expired, destroy
      await this.ctx.storage.deleteAll();
      return;
    }

    // Schedule alarm for when TTL expires
    const alarmTime = Date.now() + remaining;
    await this.ctx.storage.setAlarm(alarmTime);
  }

  private async scheduleTtlAlarm(): Promise<void> {
    const alarmTime = Date.now() + ANONYMOUS_TTL_MS;
    await this.ctx.storage.setAlarm(alarmTime);
  }

  // ============================================================================
  // Edit Capability
  // ============================================================================

  private async checkEditCapability(ctx: ConnectionContext): Promise<boolean> {
    const cookieHeader = ctx.request.headers.get("cookie");
    if (!cookieHeader) {
      return false;
    }

    const match = cookieHeader.match(EDIT_CAP_REGEXP);
    if (!match) {
      return false;
    }

    const meta = this.getMeta();
    if (!meta?.docId) {
      return false;
    }

    const payload = await verifyEditCookie(
      match[1],
      meta.docId,
      this.env.JWT_SECRET
    );
    return payload !== null;
  }

  private async checkOwner(ctx: ConnectionContext): Promise<boolean> {
    const cookieHeader = ctx.request.headers.get("cookie");
    if (!cookieHeader) {
      return false;
    }

    const sessionMatch = cookieHeader.match(SESSION_COOKIE_REGEXP);
    if (!sessionMatch) {
      return false;
    }

    const meta = this.getMeta();
    if (!meta?.ownerUserId) {
      return false;
    }

    try {
      const claims = await verifyJwt(sessionMatch[1], {
        secret: this.env.JWT_SECRET,
        expiresInSeconds: 3600,
        audience: "markdown.party",
        issuer: "markdown.party",
      });
      return claims.userId === meta.ownerUserId;
    } catch {
      return false;
    }
  }

  // ============================================================================
  // Canonical Markdown Protocol
  // ============================================================================

  private handleCanonicalMarkdown(
    _connection: Connection,
    payload: CanonicalMarkdownPayload
  ): void {
    // Save the canonical markdown for raw endpoint
    this.saveCanonicalMarkdown(payload.markdown);

    const pending = this.pendingMarkdownRequests.get(payload.requestId);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingMarkdownRequests.delete(payload.requestId);
      pending.resolve(payload.markdown);
    }
  }

  private handlePushLocal(): void {
    // Clear etag to force overwrite on next save
    const meta = this.getMeta();
    if (meta?.githubBackend) {
      const backend = this.parseGitHubBackend(meta.githubBackend);
      if (backend) {
        backend.etag = null; // Clear etag to skip conditional write
        meta.githubBackend = JSON.stringify(backend);
        this.setMeta(meta);
      }
    }

    // Trigger immediate sync
    this.syncBackoffAttempt = 0;
    this.syncToGitHub();
  }

  private async handleDiscardLocal(): Promise<void> {
    const meta = this.getMeta();
    if (!(meta?.githubBackend && meta.ownerUserId)) {
      return;
    }

    const backend = this.parseGitHubBackend(meta.githubBackend);
    if (!backend) {
      return;
    }

    const accessToken = await this.getGitHubToken(meta);
    if (!accessToken) {
      return;
    }

    const remoteRes = await fetch(
      `https://api.github.com/gists/${backend.gistId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "markdown.party",
        },
      }
    );

    if (!remoteRes.ok) {
      this.broadcastSyncStatus(
        "error-retrying",
        `Failed to fetch remote: ${remoteRes.status}`
      );
      return;
    }

    const remoteData = await this.parseGistResponse(remoteRes);
    if (!remoteData) {
      this.broadcastSyncStatus("error-retrying", "Invalid remote data");
      return;
    }
    const remoteMarkdown = remoteData.files[backend.filename]?.content ?? "";

    // Update etag
    const newEtag = remoteRes.headers.get("etag");
    backend.etag = newEtag;
    meta.githubBackend = JSON.stringify(backend);
    this.setMeta(meta);

    // Broadcast reload-remote to all clients
    this.broadcastMessage({
      type: "reload-remote",
      payload: { markdown: remoteMarkdown },
    });
  }

  // ============================================================================
  // Validation Helpers
  // ============================================================================

  private isValidDocRoomMeta(value: unknown): value is DocRoomMeta {
    if (typeof value !== "object" || value === null) {
      return false;
    }
    const m = value as Record<string, unknown>;
    return (
      typeof m.initialized === "boolean" &&
      typeof m.docId === "string" &&
      (m.ownerUserId === null || typeof m.ownerUserId === "string") &&
      typeof m.editTokenHash === "string" &&
      (m.githubBackend === null || typeof m.githubBackend === "string") &&
      typeof m.createdAt === "string" &&
      typeof m.lastActivityAt === "string"
    );
  }

  private parseGitHubBackend(json: string): {
    type: "gist";
    gistId: string;
    filename: string;
    etag: string | null;
  } | null {
    try {
      const parsed = JSON.parse(json);
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        parsed.type === "gist" &&
        typeof parsed.gistId === "string" &&
        typeof parsed.filename === "string" &&
        (parsed.etag === null || typeof parsed.etag === "string")
      ) {
        return {
          type: "gist",
          gistId: parsed.gistId,
          filename: parsed.filename,
          etag: parsed.etag,
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  private parseSessionData(json: string): { encryptedToken: string } | null {
    try {
      const parsed = JSON.parse(json) as unknown;
      if (typeof parsed !== "object" || parsed === null) {
        return null;
      }
      const parsedRecord = parsed as Record<string, unknown>;
      if (typeof parsedRecord.encryptedToken !== "string") {
        return null;
      }
      return { encryptedToken: parsedRecord.encryptedToken };
    } catch {
      return null;
    }
  }

  private async parseGistResponse(
    response: Response
  ): Promise<{ files: Record<string, { content: string }> } | null> {
    try {
      const parsed = (await response.json()) as unknown;
      if (typeof parsed !== "object" || parsed === null) {
        return null;
      }
      const parsedRecord = parsed as Record<string, unknown>;
      if (
        typeof parsedRecord.files !== "object" ||
        parsedRecord.files === null
      ) {
        return null;
      }
      return {
        files: parsedRecord.files as Record<string, { content: string }>,
      };
    } catch {
      return null;
    }
  }

  private async parseInitializeBody(req: Request): Promise<{
    docId: string;
    ownerUserId?: string;
    editTokenHash: string;
  } | null> {
    try {
      const parsed = (await req.json()) as unknown;
      if (typeof parsed !== "object" || parsed === null) {
        return null;
      }
      const parsedRecord = parsed as Record<string, unknown>;
      if (
        typeof parsedRecord.docId !== "string" ||
        typeof parsedRecord.editTokenHash !== "string" ||
        (parsedRecord.ownerUserId !== undefined &&
          typeof parsedRecord.ownerUserId !== "string")
      ) {
        return null;
      }
      return {
        docId: parsedRecord.docId,
        ownerUserId: parsedRecord.ownerUserId,
        editTokenHash: parsedRecord.editTokenHash,
      };
    } catch {
      return null;
    }
  }

  private async parseVerifyTokenBody(
    req: Request
  ): Promise<{ tokenHash: string } | null> {
    try {
      const parsed = (await req.json()) as unknown;
      if (typeof parsed !== "object" || parsed === null) {
        return null;
      }
      const parsedRecord = parsed as Record<string, unknown>;
      if (typeof parsedRecord.tokenHash !== "string") {
        return null;
      }
      return { tokenHash: parsedRecord.tokenHash };
    } catch {
      return null;
    }
  }

  private async parseUpdateTokenBody(
    req: Request
  ): Promise<{ editTokenHash: string } | null> {
    try {
      const parsed = (await req.json()) as unknown;
      if (typeof parsed !== "object" || parsed === null) {
        return null;
      }
      const parsedRecord = parsed as Record<string, unknown>;
      if (typeof parsedRecord.editTokenHash !== "string") {
        return null;
      }
      return { editTokenHash: parsedRecord.editTokenHash };
    } catch {
      return null;
    }
  }

  private async parseUpdateGitHubBody(req: Request): Promise<{
    githubBackend: {
      type: "gist";
      gistId: string;
      filename: string;
      etag: string | null;
    } | null;
  } | null> {
    try {
      const parsed = (await req.json()) as unknown;
      if (typeof parsed !== "object" || parsed === null) {
        return null;
      }
      const parsedRecord = parsed as Record<string, unknown>;
      if (parsedRecord.githubBackend === null) {
        return { githubBackend: null };
      }
      if (
        typeof parsedRecord.githubBackend !== "object" ||
        parsedRecord.githubBackend === null
      ) {
        return null;
      }
      const githubBackend = parsedRecord.githubBackend as Record<
        string,
        unknown
      >;
      if (
        githubBackend.type !== "gist" ||
        typeof githubBackend.gistId !== "string" ||
        typeof githubBackend.filename !== "string" ||
        (githubBackend.etag !== null && typeof githubBackend.etag !== "string")
      ) {
        return null;
      }
      return {
        githubBackend: {
          type: "gist",
          gistId: githubBackend.gistId,
          filename: githubBackend.filename,
          etag: githubBackend.etag as string | null,
        },
      };
    } catch {
      return null;
    }
  }
}
