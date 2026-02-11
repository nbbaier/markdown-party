import { useCallback, useEffect, useState } from "react";
import {
  type CustomMessage,
  type ErrorRetryingPayload,
  MessageTypeErrorRetrying,
  MessageTypeRemoteChanged,
  MessageTypeSyncStatus,
  type RemoteChangedPayload,
  type SyncState,
  type SyncStatusPayload,
} from "../../shared/messages";
import type { UseCustomMessagesProps } from "./use-custom-messages";
import { useCustomMessages } from "./use-custom-messages";

export interface SyncStatusInfo {
  syncState: SyncState | null;
  detail?: string;
  pendingSince?: string;
  expiresAt?: string;
  retryAttempt?: number;
  nextRetryAt?: number;
  remoteMarkdown?: string;
  localMarkdown?: string;
}

export interface UseSyncStatusProps extends UseCustomMessagesProps {
  getMarkdown?: () => string;
}

export function useSyncStatus({ provider, getMarkdown }: UseSyncStatusProps) {
  const [status, setStatus] = useState<SyncStatusInfo>({ syncState: null });
  const { on, send } = useCustomMessages({ provider });

  const handleSyncStatus = useCallback((message: CustomMessage) => {
    if (message.type !== MessageTypeSyncStatus) {
      return;
    }
    const payload = message.payload as SyncStatusPayload;
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
    const payload = message.payload as ErrorRetryingPayload;
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
      const payload = message.payload as RemoteChangedPayload;
      setStatus((prev) => ({
        ...prev,
        syncState: "conflict" as SyncState,
        remoteMarkdown: payload.remoteMarkdown,
        localMarkdown: getMarkdown?.() ?? "",
      }));
    },
    [getMarkdown]
  );

  useEffect(() => {
    const unsubs = [
      on(MessageTypeSyncStatus, handleSyncStatus),
      on(MessageTypeErrorRetrying, handleErrorRetrying),
      on(MessageTypeRemoteChanged, handleRemoteChanged),
    ];
    return () => {
      for (const unsub of unsubs) {
        unsub();
      }
    };
  }, [on, handleSyncStatus, handleErrorRetrying, handleRemoteChanged]);

  const dismissConflict = useCallback(() => {
    setStatus((prev) => ({
      ...prev,
      remoteMarkdown: undefined,
      localMarkdown: undefined,
    }));
  }, []);

  return { status, send, dismissConflict };
}
