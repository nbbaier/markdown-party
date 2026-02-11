import { useEffect, useRef, useState } from "react";
import YProvider from "y-partyserver/provider";
import type { Awareness } from "y-protocols/awareness";
import { Doc } from "yjs";

export type ConnectionState = "connecting" | "connected" | "disconnected";

export interface CollabUser {
  name: string;
  userId: string;
  color: string;
}

export interface CollabProviderResult {
  doc: Doc | null;
  provider: YProvider | null;
  awareness: Awareness | null;
  connectionState: ConnectionState;
}

export interface UseCollabProviderProps {
  docId: string | null | undefined;
  user?: { userId: string; login: string; avatarUrl: string } | null;
}

const CURSOR_COLORS = [
  { color: "#30bced", light: "#30bced33" },
  { color: "#6eeb83", light: "#6eeb8333" },
  { color: "#ffbc42", light: "#ffbc4233" },
  { color: "#e84855", light: "#e8485533" },
  { color: "#8458B3", light: "#8458B333" },
  { color: "#0D98BA", light: "#0D98BA33" },
  { color: "#FFA07A", light: "#FFA07A33" },
  { color: "#20B2AA", light: "#20B2AA33" },
];

function userColor(userId: string): { color: string; light: string } {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    // biome-ignore lint/suspicious/noBitwiseOperators: DJB2 hash algorithm
    hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0;
  }
  return CURSOR_COLORS[Math.abs(hash) % CURSOR_COLORS.length];
}

export function useCollabProvider({
  docId,
  user,
}: UseCollabProviderProps): CollabProviderResult {
  const [doc, setDoc] = useState<Doc | null>(null);
  const [provider, setProvider] = useState<YProvider | null>(null);
  const [awareness, setAwareness] = useState<Awareness | null>(null);
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("disconnected");

  const providerRef = useRef<YProvider | null>(null);
  const docRef = useRef<Doc | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: Only depend on userId to avoid unnecessary reconnects
  useEffect(() => {
    if (!docId) {
      return;
    }

    const ydoc = new Doc();
    docRef.current = ydoc;
    setDoc(ydoc);

    const yProvider = new YProvider(window.location.host, docId, ydoc, {
      party: "doc-room",
    });

    providerRef.current = yProvider;
    setProvider(yProvider);
    setAwareness(yProvider.awareness);
    setConnectionState("connecting");

    yProvider.on("sync", (isSynced: boolean) => {
      if (isSynced) {
        setConnectionState("connected");
      }
    });

    yProvider.on("connection-close", () => {
      setConnectionState("disconnected");
    });

    yProvider.on("connection-error", () => {
      setConnectionState("disconnected");
    });

    if (user) {
      const colors = userColor(user.userId);
      yProvider.awareness.setLocalStateField("user", {
        name: user.login,
        userId: user.userId,
        color: colors.color,
        colorLight: colors.light,
      });
    } else {
      // Anonymous user - assign "Guest N" name with random color
      const guestNumber = Math.floor(Math.random() * 1000);
      const guestId = `guest-${guestNumber}-${Date.now()}`;
      const colors = userColor(guestId);
      yProvider.awareness.setLocalStateField("user", {
        name: `Guest ${guestNumber}`,
        userId: guestId,
        color: colors.color,
        colorLight: colors.light,
      });
    }

    yProvider.connect();

    return () => {
      yProvider.destroy();
      ydoc.destroy();
      providerRef.current = null;
      docRef.current = null;
      setDoc(null);
      setProvider(null);
      setAwareness(null);
      setConnectionState("disconnected");
    };
  }, [docId, user?.userId]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && providerRef.current) {
        providerRef.current.connect();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return { doc, provider, awareness, connectionState };
}
