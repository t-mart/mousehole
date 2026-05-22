import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { wsStateUpdateMessageSchema } from "#backend/types.ts";

export const stateQueryKey: readonly [string] = ["state"];
const heartbeatIntervalMilliseconds = 30_000;
const reconnectDelayMilliseconds = 3000;

function handleWebSocketError(event: Event) {
  console.error("WebSocket error:", event);
}

export function useInvalidateOnStateUpdate() {
  const queryClient = useQueryClient();
  const websocketRef = useRef<WebSocket | undefined>(undefined);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | undefined>(
    undefined
  );
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );
  useEffect(() => {
    let cleanupListeners: (() => void) | undefined;

    function handleMessage(event: MessageEvent<string>) {
      if (event.data === "pong") return;

      let json: unknown;
      try {
        json = JSON.parse(event.data);
      } catch {
        console.error("Failed to parse WebSocket message as JSON:", event.data);
        return;
      }

      const { data: message, error } =
        wsStateUpdateMessageSchema.safeParse(json);
      if (error) {
        console.error("Unexpected WebSocket message shape:", error.message);
        return;
      }

      queryClient.setQueryData(stateQueryKey, message.data);
    }

    function connect() {
      cleanupListeners?.();
      const websocket = new WebSocket("/web/ws");
      websocketRef.current = websocket;

      function handleOpen() {
        clearTimeout(reconnectTimeoutRef.current);
        queryClient.invalidateQueries({ queryKey: stateQueryKey });
        heartbeatRef.current = setInterval(() => {
          if (websocket.readyState === WebSocket.OPEN) {
            websocket.send("ping");
          }
        }, heartbeatIntervalMilliseconds);
      }

      function handleClose() {
        clearInterval(heartbeatRef.current);
        reconnectTimeoutRef.current = setTimeout(
          connect,
          reconnectDelayMilliseconds
        );
      }

      // eslint-disable-next-line @eslint-react/web-api/no-leaked-event-listener
      websocket.addEventListener("open", handleOpen);
      // eslint-disable-next-line @eslint-react/web-api/no-leaked-event-listener
      websocket.addEventListener("message", handleMessage);
      // eslint-disable-next-line @eslint-react/web-api/no-leaked-event-listener
      websocket.addEventListener("close", handleClose);
      // eslint-disable-next-line @eslint-react/web-api/no-leaked-event-listener
      websocket.addEventListener("error", handleWebSocketError);

      cleanupListeners = () => {
        websocket.removeEventListener("open", handleOpen);
        websocket.removeEventListener("message", handleMessage);
        websocket.removeEventListener("close", handleClose);
        websocket.removeEventListener("error", handleWebSocketError);
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
  }, [queryClient]);
}
