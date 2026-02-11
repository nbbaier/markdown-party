interface ConflictModalProps {
  localMarkdown: string;
  remoteMarkdown: string;
  onPushLocal: () => void;
  onDiscardLocal: () => void;
}

export function ConflictModal({
  localMarkdown,
  remoteMarkdown,
  onPushLocal,
  onDiscardLocal,
}: ConflictModalProps) {
  return (
    <div
      aria-label="Conflict resolution"
      aria-modal="true"
      className="conflict-overlay"
      role="dialog"
    >
      <div className="conflict-modal">
        <h3 className="conflict-title">Conflict Detected</h3>
        <p className="conflict-description">
          The remote document has been modified since your last sync. Choose how
          to resolve:
        </p>

        <div className="conflict-diff">
          <div className="conflict-pane">
            <h4>Your version (local)</h4>
            <pre className="conflict-content">{localMarkdown}</pre>
          </div>
          <div className="conflict-pane">
            <h4>Remote version (GitHub)</h4>
            <pre className="conflict-content">{remoteMarkdown}</pre>
          </div>
        </div>

        <div className="conflict-actions">
          <button
            className="btn btn-primary"
            onClick={onPushLocal}
            type="button"
          >
            Push local to remote
          </button>
          <button
            className="btn btn-danger"
            onClick={onDiscardLocal}
            type="button"
          >
            Discard local, reload remote
          </button>
        </div>
      </div>
    </div>
  );
}
