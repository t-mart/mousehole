import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { stateQueryKey } from "#frontend/lib/state-query.ts";

/**
 * Subscribes to the server's SSE stream. The signal is contentless, so every
 * message just invalidates the state query — GET /state stays the single source of
 * truth. The browser's EventSource handles reconnection on its own; we also
 * invalidate on `open` so a reconnect re-pulls and catches any signal missed while
 * disconnected. Connection errors are left to EventSource's auto-reconnect (no
 * toast — connection health is not a user-facing condition).
 */
export function useServerEvents() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const eventSource = new EventSource("/web/events");
    const invalidate = () => {
      void queryClient.invalidateQueries({ queryKey: stateQueryKey });
    };

    eventSource.addEventListener("open", invalidate);
    eventSource.addEventListener("message", invalidate);

    return () => {
      eventSource.removeEventListener("open", invalidate);
      eventSource.removeEventListener("message", invalidate);
      eventSource.close();
    };
  }, [queryClient]);
}
