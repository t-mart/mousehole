// The capture runner. Builds the app once, then for each selected capture stands
// up a fresh in-process demo server (its own mock MAM behavior, password, and
// state dir), drives the scene with Playwright, writes the artifact to demo/out,
// and optionally runs it through ffmpeg.
//
// Usage:
//   bun demo                 record every capture
//   bun demo readme-demo     record the named capture(s)
//   bun demo --list          list available captures
//   bun demo --no-build      skip the one-time production build
// Captures are defined in ./captures; per-capture cookie/password/mock/tempo
// live there, not on the CLI.

import { cac } from "cac";
import { mkdir, rm } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { attachRecorder } from "playwright-recorder-plus";

import type { Capture, FfmpegPost, ImageCapture, Quality } from "./capture.ts";

import { buildContext } from "./actions.ts";
import { captures } from "./captures/index.ts";
import { startDemoServer } from "./server.ts";
import { DEFAULT_TEMPO } from "./tempo.ts";

const DEMO_DIR = import.meta.dirname;
const ROOT_DIR = path.resolve(DEMO_DIR, "..");
const OUT_DIR = path.resolve(DEMO_DIR, "out");
const STATE_ROOT = path.resolve(DEMO_DIR, ".state");
const APP_PATH = "/web/";
const DEFAULT_VIEWPORT = { width: 720, height: 720 };
const DEFAULT_DEVICE_SCALE_FACTOR = 2;
const READY_TIMEOUT_MS = 30_000;

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Grab an open port from the OS so a capture's server never collides with a dev
// server (or a previous capture still releasing its socket).
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

const cli = cac("demo");
cli
  .option("--all", "record every capture (the default)")
  .option("--list", "list available captures and exit")
  .option("--no-build", "skip the one-time production build")
  .help();
const { args: names, options } = cli.parse();

function selectCaptures(): Capture[] {
  if (names.length === 0 || options.all) return [...captures];
  const byName = new Map(captures.map((capture) => [capture.name, capture]));
  return names.map((name: string) => {
    const capture = byName.get(name);
    if (!capture) {
      throw new Error(
        `Unknown capture "${name}". Run with --list to see them.`,
      );
    }
    return capture;
  });
}

// The whole stack answers once the backend serves the built page, so a 200 here
// means it's ready.
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
  throw new Error(
    `Demo server not ready at ${url} after ${READY_TIMEOUT_MS}ms`,
  );
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

// The CDP screencast captures at the browser's real surface DPR, and only
// --force-device-scale-factor sets that. Context deviceScaleFactor is page-level
// emulation that never reaches the screencast, so without this flag the video is
// a 1x, jaggy capture no matter what size the recorder requests. The flag is
// browser-global, so each capture launches its own browser at its own scale.
async function launchChromium(scale: number): Promise<Browser> {
  try {
    return await chromium.launch({
      args: [`--force-device-scale-factor=${scale}`],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/Executable doesn't exist|playwright install/i.test(message)) {
      throw new Error(
        "Chromium isn't installed for Playwright. Install it with: bunx playwright install chromium",
      );
    }
    throw error;
  }
}

// Log in in a throwaway context and return the storage state, so the recorded
// context starts already authenticated (no login screen on film). Best-effort:
// if auth is off there's no password field and we just continue.
async function authenticate(page: Page, baseURL: string, password: string) {
  // const context = await browser.newContext({ baseURL });
  try {
    // const page = await context.newPage();
    await page.goto(APP_PATH);

    const passwordField = page.getByLabel("Password");
    const needsLogin = await passwordField
      .waitFor({ state: "visible", timeout: 5000 })
      .then(() => true)
      .catch(() => false);

    if (needsLogin) {
      await passwordField.fill(password);
      const submit = page.getByRole("button", { name: "Log in" });
      await submit.click();
      await submit
        .waitFor({ state: "detached", timeout: 10_000 })
        .catch(() => {});
    }

    // return await context.storageState();
  } finally {
    // await context.close();
  }
}

// Screenshot the page, optionally cropped to an element with padding around it
// (so the element sits centered with some breathing room).
async function shootImage(
  page: Page,
  capture: ImageCapture,
  viewport: { width: number; height: number },
  outPath: string,
): Promise<void> {
  if (!capture.clip) {
    await page.screenshot({ path: outPath });
    return;
  }

  const locator = capture.clip.element(page);
  await locator.waitFor({ state: "visible" });
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error(
      `Capture "${capture.name}" clip element has no bounding box`,
    );
  }

  const pad = capture.clip.padding ?? 24;
  const x = Math.max(0, box.x - pad);
  const y = Math.max(0, box.y - pad);
  const width = Math.min(viewport.width, box.x + box.width + pad) - x;
  const height = Math.min(viewport.height, box.y + box.height + pad) - y;
  await page.screenshot({ path: outPath, clip: { x, y, width, height } });
}

// Run an ffmpeg postprocess. If ffmpeg isn't installed, keep the raw artifact
// and warn rather than failing the whole run.
async function postprocess(
  post: FfmpegPost,
  input: string,
  name: string,
): Promise<string> {
  const output = path.join(OUT_DIR, `${name}.${post.ext}`);
  try {
    const proc = Bun.spawn(["ffmpeg", ...post.args({ input, output })], {
      stdout: "inherit",
      stderr: "inherit",
    });
    if ((await proc.exited) !== 0) throw new Error("ffmpeg failed");
    return output;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/ENOENT|not found|Failed to spawn/i.test(message)) {
      console.warn(
        `Skipping postprocess for "${name}": ffmpeg not found. Kept ${input}.`,
      );
      return input;
    }
    throw error;
  }
}

async function runCapture(capture: Capture): Promise<void> {
  const env = capture.env ?? {};
  const viewport = capture.viewport ?? DEFAULT_VIEWPORT;
  const quality: Quality = capture.quality ?? {};
  const scale = quality.scale ?? DEFAULT_DEVICE_SCALE_FACTOR;
  const stateDirectory = path.join(STATE_ROOT, capture.name);

  if (env.clearState)
    await rm(stateDirectory, { recursive: true, force: true });
  await mkdir(stateDirectory, { recursive: true });

  const server = startDemoServer({
    password: env.password,
    mam: env.mam,
    stateDir: stateDirectory,
    port: await freePort(),
  });

  const browser = await launchChromium(scale);

  try {
    await waitForServer(server.baseURL + APP_PATH);

    const preAuthenticate = env.preAuthenticate ?? env.password !== undefined;

    const context = await browser.newContext({
      baseURL: server.baseURL,
      viewport: {
        width: viewport.width*2,
        height: viewport.height*2,
      },
    });

    const page = await context.newPage();
    await page.evaluate("document.body.style.zoom=2.0");


    if (preAuthenticate && env.password !== undefined) {
      await authenticate(page, server.baseURL, env.password);
    }

    // Capture a crisp H.264 video with playwright-recorder-plus. The forced
    // surface DPR makes the screencast deliver frames at viewport * scale, so
    // size must match exactly or the recorder throws on the first frame.
    // autoStart:false lets us bound the recording to run() via start()/stop(),
    // excluding setup and teardown.
    const recorder =
      capture.kind === "video"
        ? await attachRecorder(page, {
            path: path.join(OUT_DIR, `${capture.name}.mp4`),
            autoStart: false,
            size: {
              width: viewport.width*2,
              height: viewport.height*2,
            },
            fps: 60
          })
        : undefined;

    const ctx = await buildContext(page, {
      baseURL: server.baseURL,
      viewport,
      tempo: { ...DEFAULT_TEMPO, ...capture.tempo },
      cookie: env.cookie,
      mam: server.mam,
    });

    await recorder?.start();
    await capture.run(ctx);
    await recorder?.stop(); // ends capture; second pass runs in the background

    let artifact: string;
    if (capture.kind === "video") {
      const result = await recorder!.finalized; // wait for the mp4 to land
      await context.close();
      artifact = result.path;
    } else {
      artifact = path.join(OUT_DIR, `${capture.name}.png`);
      await shootImage(page, capture, viewport, artifact);
      await context.close();
    }

    if (capture.postprocess) {
      artifact = await postprocess(capture.postprocess, artifact, capture.name);
    }
    console.log(`Wrote ${artifact}`);
  } finally {
    await browser.close();
    await server.stop();
  }
}

async function main(): Promise<void> {
  if (options.list) {
    for (const capture of captures) {
      console.log(
        `${capture.name}\t[${capture.kind}]\t${capture.description ?? ""}`,
      );
    }
    return;
  }

  const selected = selectCaptures();
  await mkdir(OUT_DIR, { recursive: true });
  if (options.build !== false) await buildApp();

  for (const capture of selected) {
    console.log(`\n== ${capture.name} (${capture.kind}) ==`);
    await runCapture(capture);
  }
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
