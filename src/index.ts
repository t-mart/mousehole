// The only module with import-time side effects: start the server and wire
// process signals to its shutdown.

import { startServer } from "#backend/server.ts";

const { stop } = startServer();

async function shutdown() {
  await stop();
  // eslint-disable-next-line unicorn/no-process-exit
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown();
});
process.on("SIGTERM", () => {
  void shutdown();
});
