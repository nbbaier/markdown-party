// Message type constants
export const MessageTypeRequestMarkdown = "request-markdown";
export const MessageTypeCanonicalMarkdown = "canonical-markdown";
export const MessageTypeNeedsInit = "needs-init";
export const MessageTypeReloadRemote = "reload-remote";
export const MessageTypeRemoteChanged = "remote-changed";
export const MessageTypeSyncStatus = "sync-status";
export const MessageTypeErrorRetrying = "error-retrying";
export const MessageTypeConflict = "conflict";
export const MessageTypePushLocal = "push-local";
export const MessageTypeDiscardLocal = "discard-local";

export type MessageType =
  | typeof MessageTypeRequestMarkdown
  | typeof MessageTypeCanonicalMarkdown
  | typeof MessageTypeNeedsInit
  | typeof MessageTypeReloadRemote
  | typeof MessageTypeRemoteChanged
  | typeof MessageTypeSyncStatus
  | typeof MessageTypeErrorRetrying
  | typeof MessageTypeConflict
  | typeof MessageTypePushLocal
  | typeof MessageTypeDiscardLocal;

export interface RequestMarkdownPayload {
  requestId: string;
}

export interface CanonicalMarkdownPayload {
  requestId: string;
  markdown: string;
}

// needs-init only fires for GitHub-linked docs whose snapshot expired
// not for anonymous docs (Phase 1)
export interface NeedsInitPayload {
  docId: string;
}

export interface ReloadRemotePayload {
  markdown: string;
}

export interface RemoteChangedPayload {
  remoteMarkdown: string;
}

export type SyncState =
  | "saved"
  | "saving"
  | "error-retrying"
  | "pending-sync"
  | "conflict";

export interface SyncStatusPayload {
  state: SyncState;
  detail?: string;
  pendingSince?: string;
  expiresAt?: string;
}

export interface ErrorRetryingPayload {
  attempt: number;
  nextRetryAt: number;
}

export type PushLocalPayload = Record<string, never>;
export type DiscardLocalPayload = Record<string, never>;

export type CustomMessage =
  | { type: typeof MessageTypeRequestMarkdown; payload: RequestMarkdownPayload }
  | {
      type: typeof MessageTypeCanonicalMarkdown;
      payload: CanonicalMarkdownPayload;
    }
  | { type: typeof MessageTypeNeedsInit; payload: NeedsInitPayload }
  | { type: typeof MessageTypeReloadRemote; payload: ReloadRemotePayload }
  | { type: typeof MessageTypeRemoteChanged; payload: RemoteChangedPayload }
  | { type: typeof MessageTypeSyncStatus; payload: SyncStatusPayload }
  | { type: typeof MessageTypeErrorRetrying; payload: ErrorRetryingPayload }
  | { type: typeof MessageTypePushLocal; payload: PushLocalPayload }
  | { type: typeof MessageTypeDiscardLocal; payload: DiscardLocalPayload };

export type MessageDirection = "do-to-client" | "client-to-do";

export const MESSAGE_DIRECTION: { [key: string]: MessageDirection } = {
  [MessageTypeRequestMarkdown]: "do-to-client",
  [MessageTypeCanonicalMarkdown]: "client-to-do",
  [MessageTypeNeedsInit]: "do-to-client",
  [MessageTypeReloadRemote]: "do-to-client",
  [MessageTypeRemoteChanged]: "do-to-client",
  [MessageTypeSyncStatus]: "do-to-client",
  [MessageTypeErrorRetrying]: "do-to-client",
  [MessageTypePushLocal]: "client-to-do",
  [MessageTypeDiscardLocal]: "client-to-do",
};

export function encodeMessage(message: CustomMessage): string {
  return JSON.stringify(message);
}

const ALL_MESSAGE_TYPES: string[] = [
  MessageTypeRequestMarkdown,
  MessageTypeCanonicalMarkdown,
  MessageTypeNeedsInit,
  MessageTypeReloadRemote,
  MessageTypeRemoteChanged,
  MessageTypeSyncStatus,
  MessageTypeErrorRetrying,
  MessageTypePushLocal,
  MessageTypeDiscardLocal,
];

// Per-type payload validation for runtime safety
const PAYLOAD_VALIDATORS: {
  [key: string]: (payload: unknown) => boolean;
} = {
  [MessageTypeRequestMarkdown]: (p): boolean =>
    typeof p === "object" &&
    p !== null &&
    "requestId" in p &&
    typeof (p as { requestId: unknown }).requestId === "string",
  [MessageTypeCanonicalMarkdown]: (p): boolean =>
    typeof p === "object" &&
    p !== null &&
    "requestId" in p &&
    typeof (p as { requestId: unknown }).requestId === "string" &&
    "markdown" in p &&
    typeof (p as { markdown: unknown }).markdown === "string",
  [MessageTypeNeedsInit]: (p): boolean =>
    typeof p === "object" && p !== null && "docId" in p,
  [MessageTypeReloadRemote]: (p): boolean =>
    typeof p === "object" &&
    p !== null &&
    "markdown" in p &&
    typeof (p as { markdown: unknown }).markdown === "string",
  [MessageTypeRemoteChanged]: (p): boolean =>
    typeof p === "object" &&
    p !== null &&
    "remoteMarkdown" in p &&
    typeof (p as { remoteMarkdown: unknown }).remoteMarkdown === "string",
  [MessageTypeSyncStatus]: (p): boolean =>
    typeof p === "object" &&
    p !== null &&
    "state" in p &&
    typeof (p as { state: unknown }).state === "string",
  [MessageTypeErrorRetrying]: (p): boolean =>
    typeof p === "object" &&
    p !== null &&
    "attempt" in p &&
    typeof (p as { attempt: unknown }).attempt === "number",
  [MessageTypePushLocal]: (p): boolean => typeof p === "object" && p !== null,
  [MessageTypeDiscardLocal]: (p): boolean =>
    typeof p === "object" && p !== null,
};

export function decodeMessage(data: string): CustomMessage {
  const parsed = JSON.parse(data);

  if (!(parsed.type && ALL_MESSAGE_TYPES.includes(parsed.type))) {
    throw new Error(`Unknown message type: ${parsed.type}`);
  }

  if (!parsed.payload || typeof parsed.payload !== "object") {
    throw new Error("Missing or invalid payload");
  }

  const validator = PAYLOAD_VALIDATORS[parsed.type];
  if (validator && !validator(parsed.payload)) {
    throw new Error(`Invalid payload for message type: ${parsed.type}`);
  }

  return parsed as CustomMessage;
}

export function isClientMessage(message: CustomMessage): boolean {
  return MESSAGE_DIRECTION[message.type] === "client-to-do";
}

export function isDOMessage(message: CustomMessage): boolean {
  return MESSAGE_DIRECTION[message.type] === "do-to-client";
}
