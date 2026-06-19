// The demo server, as a library. Stands up the real production backend serving
// the built dist/, but injects a fake MAM (the test server) through the
// fetchImpl seam so the dependency behaves deterministically and never touches
// the network. The runner (run.ts) boots one per fixture, in-process, so each
// fixture gets its own mock behavior, auth password, state dir, and env.

import { startServer } from "#backend/server.ts";

import {
  createMamTestServer,
  type MamTestServerOptions,
} from "../tests/mam-test-server.ts";

export interface DemoServerConfig {
  // App auth password. Omit to run with auth disabled.
  password?: string;
  // Fake MAM behavior. Defaults to createMamTestServer's own defaults.
  mam?: MamTestServerOptions;
  // Where the backend persists its state for this run.
  stateDir: string;
  // Port to listen on.
  port: number;
  // Extra backend env overrides (applied last, so they win).
  env?: Record<string, string>;
}

export interface DemoServer {
  baseURL: string;
  stop: () => Promise<void>;
}

export function startDemoServer(config: DemoServerConfig): DemoServer {
  const mam = createMamTestServer(config.mam);

  // A deterministic env built from scratch (no inherited process.env): NODE_ENV
  // production serves the built dist/ rather than proxying Vite, and with no
  // password we opt out of the auth requirement so startServer doesn't refuse to
  // run. Fixture env overrides come last.
  const env: NodeJS.ProcessEnv = {
    NODE_ENV: "production",
    MOUSEHOLE_PORT: String(config.port),
    MOUSEHOLE_STATE_DIR_PATH: config.stateDir,
    MOUSEHOLE_AUTH_PASSWORD: config.password,
    MOUSEHOLE_INSECURE_ALLOW_NO_AUTH:
      config.password === undefined ? "true" : "false",
    ...config.env,
  };

  const { url, stop } = startServer(env, { fetchImpl: mam.fetchImpl });

  return { baseURL: String(url).replace(/\/$/, ""), stop };
}
