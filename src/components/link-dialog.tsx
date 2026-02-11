import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
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
  onSubmit: (url: string) => void;
}

export default function LinkDialog({
  open,
  onOpenChange,
  defaultUrl,
  onSubmit,
}: LinkDialogProps) {
  const [url, setUrl] = useState(defaultUrl);
  const [error, setError] = useState("");

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
              value={url}
            />
            {error && <p className="text-destructive text-sm">{error}</p>}
          </div>
          <DialogFooter>
            <Button
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            {defaultUrl && (
              <Button
                className="text-destructive hover:bg-destructive/10"
                onClick={() => {
                  onSubmit("");
                  onOpenChange(false);
                }}
                type="button"
                variant="outline"
              >
                Remove Link
              </Button>
            )}
            <Button type="submit">Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
