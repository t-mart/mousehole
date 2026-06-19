// A "capture" is one documentation artifact to produce: a named scene driven by
// Playwright, recorded as a video or photographed as an image. The runner
// (record.ts) restarts a fresh in-process demo server per capture using its env,
// drives `run`, finalizes the artifact, and optionally postprocesses it through
// ffmpeg. The list of captures lives in ./captures/.

import type { Locator, Page } from "playwright";

import type {
  MamTestServerOptions,
  MamUpdateOutcome,
} from "../tests/mam-test-server.ts";
import type { Tempo } from "./tempo.ts";

// Per-capture server/auth setup. The runner starts the demo server with this.
export interface CaptureEnv {
  // App auth password the server runs with. Omit to run with auth disabled, so a
  // capture can film with no login at all.
  password?: string;
  // Fake MAM behavior for this capture (outcome/ip/asn/as/rotateCookieTo).
  mam?: MamTestServerOptions;
  // Whether to log in before handing the page to run(). Defaults to true when a
  // password is set; set false to let the capture film the login screen itself.
  preAuthenticate?: boolean;
  // Cookie value this capture types into the form, if any. Safe to commit as a
  // fake string since the MAM the cookie talks to is mocked.
  cookie?: string;
  // Wipe this capture's state dir before running. Defaults to false so state
  // persists between runs (lets a capture start from preloaded state).
  clearState?: boolean;
}

export interface Quality {
  scale?: number;
}

// The surface handed to a capture's run(). Hides the page/tempo plumbing behind
// a few bound action helpers; reach for `page` for anything bespoke.
export interface CaptureContext {
  page: Page;
  baseURL: string;
  viewport: { width: number; height: number };
  cookie?: string;
  tempo: Tempo;
  // The live fake MAM, so a capture can change its behavior mid-shot.
  mam: { setOutcome: (outcome: MamUpdateOutcome) => void };
  goto: (path: string) => Promise<void>;
  place: (x: number, y: number) => Promise<void>;
  click: (target: Locator) => Promise<void>;
  fill: (target: Locator, text: string) => Promise<void>;
  hold: (ms: number) => Promise<void>;
}

// A postprocessing pass: the ffmpeg arguments to turn the raw artifact into a
// delivery format. `args` receives the input and the resolved output path.
export interface FfmpegPost {
  ext: string;
  args: (io: { input: string; output: string }) => string[];
}

interface BaseCapture {
  // Identifier: selects the capture on the CLI and names its output file.
  name: string;
  description?: string;
  env?: CaptureEnv;
  // Defaults to 720x720.
  viewport?: { width: number; height: number };
  // Per-capture pacing, merged over DEFAULT_TEMPO.
  tempo?: Partial<Tempo>;
  quality?: Quality;
  run: (ctx: CaptureContext) => Promise<void>;
}

export interface VideoCapture extends BaseCapture {
  kind: "video";
  postprocess?: FfmpegPost;
}

export interface ImageCapture extends BaseCapture {
  kind: "image";
  // Crop to an element with some breathing room around it; centered in the shot.
  // Omit for a full-viewport screenshot.
  clip?: { element: (page: Page) => Locator; padding?: number };
  postprocess?: FfmpegPost;
}

export type Capture = VideoCapture | ImageCapture;
