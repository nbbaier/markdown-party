import type { SyncState } from "../../shared/messages";

interface SyncStatusBarProps {
  syncState: SyncState | null;
  connectionState: string;
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

  return (
    <output aria-live="polite" className={`sync-status-bar ${cssClass}`}>
      {label}
      {retryInfo}
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
