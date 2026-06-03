import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useEffectEvent, useRef } from "react";

import { wsServerMessageSchema } from "#backend/types.ts";
import { useErrors } from "#frontend/lib/error-context.tsx";
import { stateQueryKey } from "#frontend/lib/state-query.ts";

const heartbeatIntervalMilliseconds = 30_000;
const reconnectDelayMilliseconds = 3000;

/**
 * Subscribes to the server's websocket event stream and keeps the local app in
 * sync with it: pushes state updates into the query cache, surfaces server
 * errors as toasts, handles session expiry, and reconnects on connection loss.
 */
export function useServerEvents(options?: {
  onSessionExpired?: () => void;
}) {
  const queryClient = useQueryClient();
  const { addError } = useErrors();
  const websocketRef = useRef<WebSocket | undefined>(undefined);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const sessionExpiredRef = useRef(false);
  const onSessionExpired = useEffectEvent(() => {
    options?.onSessionExpired?.();
  });

  useEffect(() => {
    let cleanupListeners: (() => void) | undefined;

    function handleMessage(event: MessageEvent<string>) {
      let json: unknown;
      try {
        json = JSON.parse(event.data);
      } catch {
        addError("Received an unreadable message from the server.");
        return;
      }

      const { data: message, error } = wsServerMessageSchema.safeParse(json);
      if (error) {
        addError("Received an unexpected message shape from the server.");
        return;
      }

      if (message.type === "pong") return;

      if (message.type === "error") {
        addError(`${message.message} Check server logs for details.`);
        return;
      }

      if (message.type === "session-expired") {
        sessionExpiredRef.current = true;
        onSessionExpired();
        return;
      }

      queryClient.setQueryData(stateQueryKey, message.data);
    }

    function handleError() {
      addError("Lost connection to the server. Reconnecting…");
    }

    function connect() {
      cleanupListeners?.();
      const websocket = new WebSocket("/web/ws");
      websocketRef.current = websocket;

      function handleOpen() {
        clearTimeout(reconnectTimeoutRef.current);
        void queryClient.invalidateQueries({ queryKey: stateQueryKey });
        heartbeatRef.current = setInterval(() => {
          if (websocket.readyState === WebSocket.OPEN) {
            websocket.send(JSON.stringify({ type: "ping" }));
          }
        }, heartbeatIntervalMilliseconds);
      }

      function handleClose() {
        clearInterval(heartbeatRef.current);
        if (!sessionExpiredRef.current) {
          reconnectTimeoutRef.current = setTimeout(connect, reconnectDelayMilliseconds);
        }
      }

      // eslint-disable-next-line @eslint-react/web-api/no-leaked-event-listener
      websocket.addEventListener("open", handleOpen);
      // eslint-disable-next-line @eslint-react/web-api/no-leaked-event-listener
      websocket.addEventListener("message", handleMessage);
      // eslint-disable-next-line @eslint-react/web-api/no-leaked-event-listener
      websocket.addEventListener("close", handleClose);
      // eslint-disable-next-line @eslint-react/web-api/no-leaked-event-listener
      websocket.addEventListener("error", handleError);

      cleanupListeners = () => {
        websocket.removeEventListener("open", handleOpen);
        websocket.removeEventListener("message", handleMessage);
        websocket.removeEventListener("close", handleClose);
        websocket.removeEventListener("error", handleError);
      };
    }

    connect();

    return () => {
      clearInterval(heartbeatRef.current);
      clearTimeout(reconnectTimeoutRef.current);
      cleanupListeners?.();
      websocketRef.current?.close();
      websocketRef.current = undefined;
    };
  }, [queryClient, addError]);
}
