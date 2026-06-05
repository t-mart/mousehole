// Server-Sent Events: a contentless "something changed, re-pull GET /state" signal
// to open dashboards. The payload is deliberately empty — GET /state is the single
// source of truth

type SseClient = {
  sessionId: string;
  controller: ReadableStreamDefaultController<string>;
};

const clients = new Set<SseClient>();

function send(client: SseClient, frame: string): void {
  try {
    client.controller.enqueue(frame);
  } catch {
    // controller already closed (client gone) — drop it
    clients.delete(client);
  }
}

/**
 * Register a connected SSE client. Call the returned function from the stream's
 * `cancel()` to unregister when the client disconnects.
 */
export function registerSseClient(client: SseClient): () => void {
  clients.add(client);
  return () => clients.delete(client);
}

/** Tell every connected client to re-pull GET /state. */
export function notifyClients(): void {
  for (const client of clients) send(client, "data: changed\n\n");
}

/** Close the SSE streams belonging to a session (used on logout / session expiry). */
export function closeSessionStreams(sessionId: string): void {
  for (const client of clients) {
    if (client.sessionId !== sessionId) continue;
    try {
      client.controller.close();
    } catch {
      // already closed
    }
    clients.delete(client);
  }
}
