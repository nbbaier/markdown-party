import { useEffect, useRef, useState } from "react";
import type { ClaimEditResponse } from "../../shared/doc-meta";
import { fetchWithCsrf } from "../lib/fetch-with-csrf";

const EDIT_HASH_REGEX = /^#edit=.+$/;
const EDIT_TOKEN_REGEX = /^#edit=(.+)$/;

export interface UseEditTokenResult {
  hasEditCapability: boolean;
  claiming: boolean;
}

export function useEditToken(docId: string | undefined): UseEditTokenResult {
  const [hasEditCapability, setHasEditCapability] = useState(false);
  const [claiming, setClaiming] = useState(() => {
    if (!docId) {
      return false;
    }
    return EDIT_HASH_REGEX.test(window.location.hash);
  });
  const claimedRef = useRef(false);

  useEffect(() => {
    if (!docId || claimedRef.current) {
      return;
    }

    const hash = window.location.hash;
    const match = hash.match(EDIT_TOKEN_REGEX);
    if (!match) {
      return;
    }

    claimedRef.current = true;
    const token = match[1];

    async function claimToken() {
      try {
        const res = await fetchWithCsrf(`/api/docs/${docId}/claim`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
          credentials: "same-origin",
        });
        if (res.ok) {
          const body = (await res.json()) as ClaimEditResponse;
          setHasEditCapability(body.ok);
        }
      } catch {
        setHasEditCapability(false);
      }
      history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search
      );
      setClaiming(false);
    }
    claimToken();
  }, [docId]);

  return { hasEditCapability, claiming };
}
