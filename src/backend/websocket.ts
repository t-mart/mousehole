import type { GetStateResponseBody, WsServerMessage } from "./types.ts";

export const wsTopic = "mousehole";

type WebSocketPublisher = (topic: string, message: string) => void;

let webSocketPublisher: WebSocketPublisher | undefined;

export function setWebSocketPublisher(publisher: WebSocketPublisher): void {
  webSocketPublisher = publisher;
}

export function makeStateUpdateMessage(data: GetStateResponseBody): Extract<WsServerMessage, { type: "state-update" }> {
  return { type: "state-update", data };
}

export function notifyWebSocketClients(data: GetStateResponseBody): void {
  webSocketPublisher?.(wsTopic, JSON.stringify(makeStateUpdateMessage(data)));
}
