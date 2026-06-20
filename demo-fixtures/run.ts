// Boots the app in a named fixture's state and leaves it running so you can
// hand-drive a browser against it. The MAM dependency is mocked per the fixture;
// everything else is the real production app.
//
// Usage:
//   bun demo <fixture>     boot the app in that fixture's state
//   bun demo --list        list available fixtures
//   bun demo --no-build    skip the production build (reuse dist/)
//   bun demo --port 6000   serve on a different port (default 5011)

import { cac } from "cac";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

import { StateFileStore } from "#backend/state/store.ts";

import { fixtures, type Fixture } from "./fixtures.ts";
import { startDemoServer } from "./server.ts";

const DEMO_DIR = import.meta.dirname;
const ROOT_DIR = path.resolve(DEMO_DIR, "..");
const STATE_ROOT = path.resolve(DEMO_DIR, ".state");
const APP_PATH = "/web/";
const DEFAULT_PORT = 5011;
const READY_TIMEOUT_MS = 30_000;

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const cli = cac("demo");
cli
  .option("--list", "list available fixtures and exit")
  .option("--no-build", "skip the production build (reuse dist/)")
  .option("--port <port>", "port to serve on", { default: DEFAULT_PORT })
  .help();
const { args, options } = cli.parse();

function listFixtures(): void {
  for (const fixture of fixtures) {
    console.log(`  ${fixture.name}\t${fixture.description ?? ""}`);
  }
}

function selectFixture(): Fixture {
  const [name] = args;
  const fixture = name
    ? fixtures.find((candidate) => candidate.name === name)
    : undefined;
  if (!fixture) {
    console.error(name ? `Unknown fixture "${name}".` : "Pass a fixture name.");
    console.error("\nAvailable fixtures:");
    listFixtures();
    // eslint-disable-next-line unicorn/no-process-exit
    process.exit(1);
  }
  return fixture;
}

async function buildApp(): Promise<void> {
  console.log("Building the app (production)...");
  const proc = Bun.spawn(["bun", "run", "build"], {
    cwd: ROOT_DIR,
    stdout: "inherit",
    stderr: "inherit",
  });
  if ((await proc.exited) !== 0) throw new Error("Build failed");
}

// A 200 from the served page means the whole stack is up.
async function waitForServer(url: string): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // not listening yet
    }
    await delay(250);
  }
  throw new Error(`Server not ready at ${url} after ${READY_TIMEOUT_MS}ms`);
}

async function main(): Promise<void> {
  if (options.list) {
    listFixtures();
    return;
  }

  const fixture = selectFixture();
  const port = Number(options.port) || DEFAULT_PORT;
  const stateDirectory = path.join(STATE_ROOT, fixture.name);

  if (options.build !== false) await buildApp();

  // Always start from an empty state dir, then seed only if the fixture asks.
  await rm(stateDirectory, { recursive: true, force: true });
  await mkdir(stateDirectory, { recursive: true });
  if (fixture.initialState) {
    await new StateFileStore(stateDirectory).write(fixture.initialState);
  }

  const server = startDemoServer({
    password: fixture.password,
    mam: fixture.mam,
    env: fixture.env,
    stateDir: stateDirectory,
    port,
  });

  await waitForServer(server.baseURL + APP_PATH);

  console.log(`\nFixture: ${fixture.name}`);
  if (fixture.description) console.log(`  ${fixture.description}`);
  console.log(`  URL:      ${server.baseURL}${APP_PATH}`);
  console.log(`  Login:    ${fixture.password ?? "(auth disabled)"}`);
  console.log(
    `  State:    ${stateDirectory} (${fixture.initialState ? "seeded" : "empty"})`,
  );
  console.log("\nPress Ctrl-C to stop.");

  const shutdown = (): void => {
    console.log("\nStopping...");
    void server.stop().finally(() =>
      // eslint-disable-next-line unicorn/no-process-exit
      process.exit(0),
    );
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  // The listening server keeps the process alive until a signal arrives.
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
