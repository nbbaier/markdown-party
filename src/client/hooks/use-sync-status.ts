import { useCallback, useEffect, useRef, useState } from "react";
import type { Doc, Transaction } from "yjs";
import {
  type CustomMessage,
  MessageTypeErrorRetrying,
  MessageTypeLocalPersisted,
  MessageTypeRemoteChanged,
  MessageTypeSyncStatus,
  type SyncState,
} from "../../shared/messages";
import type { ConnectionState } from "./use-collab-provider";
import type { UseCustomMessagesProps } from "./use-custom-messages";
import { useCustomMessages } from "./use-custom-messages";

const MIN_PERSISTED_VISIBLE_MS = 1200;
const SAVING_TIMEOUT_MS = 10_000;

export type LocalPersistenceState = "idle" | "saving" | "persisted";

export interface SyncStatusInfo {
  syncState: SyncState | null;
  localPersistenceState: LocalPersistenceState;
  lastPersistedAt?: number;
  detail?: string;
  pendingSince?: string;
  expiresAt?: string;
  retryAttempt?: number;
  nextRetryAt?: number;
  remoteMarkdown?: string;
  localMarkdown?: string;
}

export interface UseSyncStatusProps extends UseCustomMessagesProps {
  doc?: Doc | null;
  connectionState?: ConnectionState;
  getMarkdown?: () => string;
}

export function useSyncStatus({
  provider,
  doc,
  connectionState,
  getMarkdown,
}: UseSyncStatusProps) {
  const [status, setStatus] = useState<SyncStatusInfo>({
    syncState: null,
    localPersistenceState: "idle",
  });
  const { on, send } = useCustomMessages({ provider });
  const lastPersistedAtRef = useRef<number | undefined>(undefined);
  const pendingSavingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const savingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSyncStatus = useCallback((message: CustomMessage) => {
    if (message.type !== MessageTypeSyncStatus) {
      return;
    }
    const { payload } = message;
    setStatus((prev) => ({
      ...prev,
      syncState: payload.state,
      detail: payload.detail,
      pendingSince: payload.pendingSince,
      expiresAt: payload.expiresAt,
    }));
  }, []);

  const handleErrorRetrying = useCallback((message: CustomMessage) => {
    if (message.type !== MessageTypeErrorRetrying) {
      return;
    }
    const { payload } = message;
    setStatus((prev) => ({
      ...prev,
      syncState: "error-retrying" as SyncState,
      retryAttempt: payload.attempt,
      nextRetryAt: payload.nextRetryAt,
    }));
  }, []);

  const handleRemoteChanged = useCallback(
    (message: CustomMessage) => {
      if (message.type !== MessageTypeRemoteChanged) {
        return;
      }
      const { payload } = message;
      setStatus((prev) => ({
        ...prev,
        syncState: "conflict" as SyncState,
        remoteMarkdown: payload.remoteMarkdown,
        localMarkdown: getMarkdown?.() ?? "",
      }));
    },
    [getMarkdown]
  );

  const clearPersistenceTimers = useCallback(() => {
    if (pendingSavingTimerRef.current) {
      clearTimeout(pendingSavingTimerRef.current);
      pendingSavingTimerRef.current = null;
    }
    if (savingTimeoutRef.current) {
      clearTimeout(savingTimeoutRef.current);
      savingTimeoutRef.current = null;
    }
  }, []);

  const setPersistenceState = useCallback(
    (localPersistenceState: LocalPersistenceState) => {
      setStatus((prev) =>
        prev.localPersistenceState === localPersistenceState
          ? prev
          : { ...prev, localPersistenceState }
      );
    },
    []
  );

  const enterSaving = useCallback(() => {
    setPersistenceState("saving");
    // Fallback if the server never confirms the save
    savingTimeoutRef.current = setTimeout(() => {
      savingTimeoutRef.current = null;
      setPersistenceState("idle");
    }, SAVING_TIMEOUT_MS);
  }, [setPersistenceState]);

  const handleLocalPersisted = useCallback(
    (message: CustomMessage) => {
      if (message.type !== MessageTypeLocalPersisted) {
        return;
      }
      const { payload } = message;
      lastPersistedAtRef.current = payload.savedAt;
      clearPersistenceTimers();
      setStatus((prev) => ({
        ...prev,
        localPersistenceState: "persisted",
        lastPersistedAt: payload.savedAt,
      }));
    },
    [clearPersistenceTimers]
  );

  useEffect(() => {
    const unsubs = [
      on(MessageTypeSyncStatus, handleSyncStatus),
      on(MessageTypeErrorRetrying, handleErrorRetrying),
      on(MessageTypeRemoteChanged, handleRemoteChanged),
      on(MessageTypeLocalPersisted, handleLocalPersisted),
    ];
    return () => {
      for (const unsub of unsubs) {
        unsub();
      }
    };
  }, [
    on,
    handleSyncStatus,
    handleErrorRetrying,
    handleRemoteChanged,
    handleLocalPersisted,
  ]);

  const dismissConflict = useCallback(() => {
    setStatus((prev) => ({
      ...prev,
      remoteMarkdown: undefined,
      localMarkdown: undefined,
    }));
  }, []);

  const markLocalChange = useCallback(() => {
    clearPersistenceTimers();
    const lastPersistedAt = lastPersistedAtRef.current;
    const delay = lastPersistedAt
      ? Math.max(0, MIN_PERSISTED_VISIBLE_MS - (Date.now() - lastPersistedAt))
      : 0;
    if (delay === 0) {
      enterSaving();
      return;
    }
    pendingSavingTimerRef.current = setTimeout(() => {
      pendingSavingTimerRef.current = null;
      enterSaving();
    }, delay);
  }, [clearPersistenceTimers, enterSaving]);

  // Only edits made in this client count as local changes. Remote edits and
  // the initial sync arrive via the provider as non-local transactions.
  useEffect(() => {
    if (!doc || connectionState !== "connected") {
      return;
    }
    const handleUpdate = (
      _update: Uint8Array,
      _origin: unknown,
      _doc: Doc,
      transaction: Transaction
    ) => {
      if (transaction.local) {
        markLocalChange();
      }
    };
    doc.on("update", handleUpdate);
    return () => {
      doc.off("update", handleUpdate);
    };
  }, [doc, connectionState, markLocalChange]);

  useEffect(() => {
    if (connectionState !== "disconnected") {
      return;
    }
    clearPersistenceTimers();
    setPersistenceState("idle");
  }, [connectionState, clearPersistenceTimers, setPersistenceState]);

  useEffect(() => clearPersistenceTimers, [clearPersistenceTimers]);

  return { status, send, dismissConflict };
}
