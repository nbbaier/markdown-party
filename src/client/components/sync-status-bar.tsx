import type { SyncState } from "../../shared/messages";
import type { LocalPersistenceState } from "../hooks/use-sync-status";

interface SyncStatusBarProps {
  syncState: SyncState | null;
  connectionState: string;
  localPersistenceState: LocalPersistenceState;
  lastPersistedAt?: number;
  retryAttempt?: number;
  nextRetryAt?: number;
}

const SYNC_LABELS: Record<SyncState, string> = {
  saved: "Saved",
  saving: "Saving\u2026",
  "error-retrying": "Error (retrying)",
  "pending-sync": "Pending sync",
  conflict: "Conflict",
};

const SYNC_CSS_CLASS: Record<SyncState, string> = {
  saved: "sync-saved",
  saving: "sync-saving",
  "error-retrying": "sync-error",
  "pending-sync": "sync-pending",
  conflict: "sync-conflict",
};

export function SyncStatusBar({
  syncState,
  connectionState,
  localPersistenceState,
  lastPersistedAt,
  retryAttempt,
  nextRetryAt,
}: SyncStatusBarProps) {
  const label = syncState ? SYNC_LABELS[syncState] : connectionState;
  const cssClass = syncState
    ? SYNC_CSS_CLASS[syncState]
    : `connection-${connectionState}`;

  const retryInfo =
    syncState === "error-retrying" && retryAttempt && nextRetryAt
      ? ` (attempt ${retryAttempt}, next retry ${formatRelativeTime(nextRetryAt)})`
      : "";

  let persistenceLabel = "No local changes";
  if (localPersistenceState === "saving") {
    persistenceLabel = "Saving changes...";
  } else if (localPersistenceState === "persisted") {
    persistenceLabel = `Changes persisted ${formatAgo(lastPersistedAt)}`;
  }

  return (
    <output
      aria-live="polite"
      className={`sync-status-bar ${cssClass}`}
      style={{
        padding: "8px 16px",
        display: "flex",
        justifyContent: "space-between",
        gap: "12px",
      }}
    >
      <span>
        {label}
        {retryInfo}
      </span>
      <span>{persistenceLabel}</span>
    </output>
  );
}

function formatRelativeTime(timestamp: number): string {
  const diff = timestamp - Date.now();
  if (diff <= 0) {
    return "now";
  }
  const seconds = Math.ceil(diff / 1000);
  if (seconds < 60) {
    return `in ${seconds}s`;
  }
  const minutes = Math.ceil(seconds / 60);
  return `in ${minutes}m`;
}

function formatAgo(timestamp?: number): string {
  if (!timestamp) {
    return "just now";
  }
  const diff = Date.now() - timestamp;
  if (diff < 1000) {
    return "just now";
  }
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) {
    return `${seconds}s ago`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}
