// The demo server, as a library. Stands up the real production backend serving
// the built dist/, but injects a fake MAM (the test server) through the
// fetchImpl seam so recordings are deterministic and never touch the network.
// The capture runner (record.ts) starts a fresh one per capture, in-process, so
// each capture gets its own mock behavior, auth password, and state dir.

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
  // Port to listen on. Pass an open one to avoid colliding with a dev server.
  port: number;
}

export interface DemoServer {
  baseURL: string;
  // The live fake MAM, exposing setOutcome to change behavior mid-run.
  mam: ReturnType<typeof createMamTestServer>;
  stop: () => Promise<void>;
}

export function startDemoServer(config: DemoServerConfig): DemoServer {
  const mam = createMamTestServer(config.mam);

  // NODE_ENV=production makes the backend serve the built dist/ rather than
  // proxy Vite. When there's no password, opt out of the auth requirement
  // explicitly (and clear any inherited password) so startServer doesn't refuse
  // to run; otherwise set the password for this capture.
  const env: NodeJS.ProcessEnv = {
    // ...process.env,
    NODE_ENV: "production",
    MOUSEHOLE_PORT: String(config.port),
    MOUSEHOLE_STATE_DIR_PATH: config.stateDir,
    MOUSEHOLE_AUTH_PASSWORD: config.password,
    MOUSEHOLE_INSECURE_ALLOW_NO_AUTH:
      config.password === undefined ? "true" : "false",
  };

  const { url, stop } = startServer(env, { fetchImpl: mam.fetchImpl });

  return { baseURL: String(url).replace(/\/$/, ""), mam, stop };
}
