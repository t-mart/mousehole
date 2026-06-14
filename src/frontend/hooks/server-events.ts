import { useEffect } from "react";

import { useStateActions } from "./state";

/**
 * Subscribes to the server's SSE stream for as long as it's mounted. The signal
 * is contentless, so every message just invalidates the state query — GET /state
 * stays the single source of truth. The browser's EventSource handles
 * reconnection on its own; we also invalidate on `open` so a reconnect re-pulls
 * and catches any signal missed while disconnected.
 *
 * Mount this only when authenticated (it lives in the dashboard). /events 401s
 * when logged out, and the browser's reconnect attempts on that failure turn
 * into a request storm that also re-pulls /state — so opening it before login is
 * actively harmful, not just wasteful.
 */
export function useServerEvents() {
  const { invalidate } = useStateActions();

  useEffect(() => {
    const eventSource = new EventSource("/events");
    const handleEvent = () => void invalidate();
    eventSource.addEventListener("open", handleEvent);
    eventSource.addEventListener("message", handleEvent);

    return () => {
      eventSource.removeEventListener("open", handleEvent);
      eventSource.removeEventListener("message", handleEvent);
      eventSource.close();
    };
  }, [invalidate]);
}
