import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function isValidLinkUrl(url: string): boolean {
  const trimmed = url.trim();

  if (trimmed.startsWith("//")) {
    return false;
  }

  return (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("mailto:") ||
    trimmed.startsWith("/") ||
    trimmed.startsWith("#")
  );
}

interface LinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultUrl: string;
  onSubmit: (url: string | null) => void;
}

export default function LinkDialog({
  open,
  onOpenChange,
  defaultUrl,
  onSubmit,
}: LinkDialogProps) {
  const [url, setUrl] = useState(defaultUrl);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setUrl(defaultUrl);
      setError("");
    }
  }, [open, defaultUrl]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();

    if (trimmed === "") {
      onSubmit("");
      onOpenChange(false);
      return;
    }

    if (!isValidLinkUrl(trimmed)) {
      setError("URL must start with http://, https://, mailto:, /, or #");
      return;
    }

    onSubmit(trimmed);
    onOpenChange(false);
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Link</DialogTitle>
          <DialogDescription>
            Enter a URL or clear the field to remove the link.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="link-url">URL</Label>
            <Input
              id="link-url"
              onChange={(e) => {
                setUrl(e.target.value);
                setError("");
              }}
              placeholder="https://example.com"
              ref={inputRef}
              value={url}
            />
            {error && <p className="text-destructive text-sm">{error}</p>}
          </div>
          <DialogFooter>
            <button
              className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-4 font-medium text-sm shadow-xs hover:bg-accent hover:text-accent-foreground"
              onClick={() => onOpenChange(false)}
              type="button"
            >
              Cancel
            </button>
            {defaultUrl && (
              <button
                className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-4 font-medium text-destructive text-sm shadow-xs hover:bg-destructive/10"
                onClick={() => {
                  onSubmit("");
                  onOpenChange(false);
                }}
                type="button"
              >
                Remove Link
              </button>
            )}
            <button
              className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 font-medium text-primary-foreground text-sm shadow-xs hover:bg-primary/90"
              type="submit"
            >
              Save
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
