import { useCallback } from "react";

interface PendingSyncBannerProps {
  pendingSince: string;
  expiresAt?: string;
  getMarkdown: () => string;
}

export function PendingSyncBanner({
  pendingSince,
  expiresAt,
  getMarkdown,
}: PendingSyncBannerProps) {
  const handleDownload = useCallback(() => {
    const markdown = getMarkdown();
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "document.md";
    a.click();
    URL.revokeObjectURL(url);
  }, [getMarkdown]);

  const sinceDate = new Date(pendingSince);
  const expiryDate = expiresAt ? new Date(expiresAt) : null;
  const daysRemaining = expiryDate
    ? Math.max(0, Math.ceil((expiryDate.getTime() - Date.now()) / 86_400_000))
    : null;

  return (
    <div className="pending-sync-banner" role="alert">
      <div className="pending-sync-content">
        <strong>Changes not synced to GitHub</strong>
        <span className="pending-sync-detail">
          Owner disconnected {formatDate(sinceDate)}.
          {daysRemaining !== null && (
            <>
              {" "}
              Expires in {daysRemaining} day{daysRemaining !== 1 ? "s" : ""}.
            </>
          )}
        </span>
      </div>
      <button
        className="btn btn-secondary pending-sync-download"
        onClick={handleDownload}
        type="button"
      >
        Download .md
      </button>
    </div>
  );
}

function formatDate(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) {
    const minutes = Math.floor(diff / 60_000);
    return `${minutes}m ago`;
  }
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
