import type { Connection, ConnectionContext } from "partyserver";
import { YServer } from "y-partyserver";
// biome-ignore lint/performance/noNamespaceImport: yjs has many exports we need
import * as Y from "yjs";
import { verifyEditCookie } from "../src/shared/edit-cookie";
import {
  type CanonicalMarkdownPayload,
  decodeMessage,
  MessageTypeCanonicalMarkdown,
} from "../src/shared/messages";
import { verifyJwt } from "./shared/jwt";

const EDIT_CAP_REGEXP = /mp_edit_cap=([^;]+)/;
const SESSION_COOKIE_REGEXP = /__session=([^;]+)/;
const ANONYMOUS_TTL_MS = 24 * 60 * 60 * 1000;

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
    console.log(`[DocRoom ${this.name}] Server started`);
    this.ensureSchema();
  }

  async onLoad(): Promise<void> {
    console.log(`[DocRoom ${this.name}] Loading...`);

    this.pendingMarkdownRequests.clear();
    this.connectionCapabilities.clear();
    this.meta = null;

    this.ensureSchema();
    this.loadMeta();

    const snapshot = this.loadSnapshot();
    if (snapshot) {
      console.log(`[DocRoom ${this.name}] Restored from snapshot`);
      Y.applyUpdate(this.document, snapshot.data);
    }

    await this.checkAndScheduleTtlAlarm();
  }

  async alarm(): Promise<void> {
    console.log(`[DocRoom ${this.name}] Alarm fired`);

    const connections = Array.from(this.getConnections());
    if (connections.length > 0) {
      console.log(
        `[DocRoom ${this.name}] Active connections exist, rescheduling alarm`
      );
      await this.scheduleTtlAlarm();
      return;
    }

    const meta = this.getMeta();
    if (!meta) {
      console.log(`[DocRoom ${this.name}] No metadata, destroying`);
      await this.ctx.storage.deleteAll();
      return;
    }

    // Anonymous docs with no activity get destroyed
    if (!meta.ownerUserId) {
      const lastActivity = new Date(meta.lastActivityAt).getTime();
      const now = Date.now();
      if (now - lastActivity >= ANONYMOUS_TTL_MS) {
        console.log(`[DocRoom ${this.name}] Anonymous doc expired, destroying`);
        await this.ctx.storage.deleteAll();
        return;
      }
    }

    // Reschedule alarm for anonymous docs
    if (!meta.ownerUserId) {
      await this.scheduleTtlAlarm();
    }
  }

  // biome-ignore lint/suspicious/useAwait: Called by framework (TODO: improve this)
  async onSave(): Promise<void> {
    console.log(`[DocRoom ${this.name}] Saving snapshot...`);

    const snapshot = Y.encodeStateAsUpdate(this.document);
    this.saveSnapshot(snapshot);

    // Update last activity
    const meta = this.getMeta();
    if (meta) {
      meta.lastActivityAt = new Date().toISOString();
      this.setMeta(meta);
    }

    // Phase 2: GitHub sync will happen here
  }

  async onConnect(
    connection: Connection,
    ctx: ConnectionContext
  ): Promise<void> {
    const currentConnections = Array.from(this.getConnections()).length;
    if (currentConnections >= DocRoom.MAX_CONNECTIONS) {
      console.log(
        `[DocRoom ${this.name}] Rejecting connection - max connections (${DocRoom.MAX_CONNECTIONS}) reached`
      );
      connection.close(4005, "Room is at capacity");
      return;
    }

    const meta = this.getMeta();
    if (!meta?.initialized) {
      console.log(
        `[DocRoom ${this.name}] Rejecting connection - not initialized`
      );
      connection.close(4004, "Room not initialized");
      return;
    }

    console.log(
      `[DocRoom ${this.name}] Connection ${connection.id} joined (${currentConnections + 1}/${DocRoom.MAX_CONNECTIONS})`
    );

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
    code: number,
    reason: string,
    _wasClean: boolean
  ): Promise<void> {
    console.log(
      `[DocRoom ${this.name}] Connection ${connection.id} left (code: ${code}, reason: ${reason})`
    );

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

  // biome-ignore lint/suspicious/useAwait: Called by framework (TODO: improve this)
  async onMessage(
    connection: Connection,
    message: string | ArrayBuffer
  ): Promise<void> {
    const messageBytes =
      typeof message === "string"
        ? new TextEncoder().encode(message).length
        : message.byteLength;

    if (messageBytes > DocRoom.MAX_MESSAGE_SIZE) {
      console.log(
        `[DocRoom ${this.name}] Message from ${connection.id} exceeds size limit (${messageBytes} > ${DocRoom.MAX_MESSAGE_SIZE})`
      );
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
          default: {
            // Ignore other message types in Phase 1
            break;
          }
        }
      } catch {
        // Not a custom message or invalid - ignore
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
    const body = (await req.json()) as {
      docId: string;
      ownerUserId?: string;
      editTokenHash: string;
    };

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
    console.log(`[DocRoom ${this.name}] Initialized for doc ${body.docId}`);

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  private async handleVerifyTokenRequest(req: Request): Promise<Response> {
    const body = (await req.json()) as { tokenHash: string };
    const meta = this.getMeta();

    const valid = meta?.editTokenHash === body.tokenHash;
    return new Response(JSON.stringify({ valid }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  private async handleUpdateTokenRequest(req: Request): Promise<Response> {
    const body = (await req.json()) as { editTokenHash: string };
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
  }

  private loadMeta(): void {
    try {
      const result = this.ctx.storage.sql.exec(
        "SELECT value FROM room_meta WHERE key = 'meta'"
      );
      const row = result.one() as { value: string } | null;
      if (row?.value) {
        this.meta = JSON.parse(row.value) as DocRoomMeta;
      }
    } catch (e) {
      console.error(`[DocRoom ${this.name}] Failed to load meta:`, e);
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
    const pending = this.pendingMarkdownRequests.get(payload.requestId);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingMarkdownRequests.delete(payload.requestId);
      console.log(
        `[DocRoom ${this.name}] Received canonical markdown (${payload.markdown.length} chars)`
      );
      pending.resolve(payload.markdown);
    }
  }
}
