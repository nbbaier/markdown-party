import { useEffect, useRef, useState } from "react";
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

    fetchWithCsrf(`/api/docs/${docId}/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
      credentials: "same-origin",
    })
      .then((res) => {
        if (res.ok) {
          setHasEditCapability(true);
        }
      })
      // biome-ignore lint/suspicious/noEmptyBlockStatements: Ignore claim errors silently
      .catch(() => {})
      .finally(() => {
        history.replaceState(
          null,
          "",
          window.location.pathname + window.location.search
        );
        setClaiming(false);
      });
  }, [docId]);

  return { hasEditCapability, claiming };
}
