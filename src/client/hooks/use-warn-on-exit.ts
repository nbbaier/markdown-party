import { useEffect } from "react";

export function useWarnOnExit(shouldWarn: boolean) {
  useEffect(() => {
    if (!shouldWarn) {
      return;
    }

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };

    window.addEventListener("beforeunload", handler);
    return () => {
      window.removeEventListener("beforeunload", handler);
    };
  }, [shouldWarn]);
}
