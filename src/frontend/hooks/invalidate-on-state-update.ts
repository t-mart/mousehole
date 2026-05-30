import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useEffectEvent, useRef } from "react";

import {
  wsServerMessageSchema,
  type ErrorResponseBody,
  type GetStateResponseBody,
} from "#backend/types.ts";

export const stateQueryKey: readonly [string] = ["state"];

export class UnauthenticatedError extends Error {
  constructor() {
    super("Unauthenticated");
    this.name = "UnauthenticatedError";
  }
}

export async function stateQueryFunction(): Promise<GetStateResponseBody> {
  const response = await fetch("/state");
  if (response.status === 401) throw new UnauthenticatedError();
  const body = (await response.json()) as GetStateResponseBody | ErrorResponseBody;
  if (!response.ok) {
    throw new Error(
      `Bad response from GET /state: ${response.status} - ${JSON.stringify(body)}`,
    );
  }
  return body as GetStateResponseBody;
}

const heartbeatIntervalMilliseconds = 30_000;
const reconnectDelayMilliseconds = 3000;

function handleWebSocketError(event: Event) {
  console.error("WebSocket error:", event);
}

export function useInvalidateOnStateUpdate(options?: {
  onSessionExpired?: () => void;
}) {
  const queryClient = useQueryClient();
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
        console.error("Failed to parse WebSocket message as JSON:", event.data);
        return;
      }

      const { data: message, error } = wsServerMessageSchema.safeParse(json);
      if (error) {
        console.error("Unexpected WebSocket message shape:", error.message);
        return;
      }

      if (message.type === "pong") return;

      if (message.type === "session-expired") {
        sessionExpiredRef.current = true;
        onSessionExpired();
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
