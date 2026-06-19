// Builds the CaptureContext handed to each capture's run(): installs the demo
// cursor and exposes a few bound action helpers (goto/place/click/fill/hold)
// over cursor.ts, so capture scripts read cleanly without threading page+tempo
// through every call.

import type { Page } from "playwright";

import type { CaptureContext } from "./capture.ts";
import type { Tempo } from "./tempo.ts";

import { clickAt, fillField, installCursor, placeCursor } from "./cursor.ts";

interface ContextOptions {
  baseURL: string;
  viewport: { width: number; height: number };
  tempo: Tempo;
  cookie?: string;
  mam: CaptureContext["mam"];
}

export async function buildContext(
  page: Page,
  options: ContextOptions,
): Promise<CaptureContext> {
  const { tempo } = options;
  await installCursor(page);

  return {
    page,
    baseURL: options.baseURL,
    viewport: options.viewport,
    cookie: options.cookie,
    tempo,
    mam: options.mam,

    // Relative paths resolve against the context's baseURL. goto waits for
    // "load"; never "networkidle" since the SSE stream stays open and would
    // never settle.
    goto: async (path) => {
      await page.goto(path);
    },
    place: (x, y) => placeCursor(page, x, y),
    click: (target) => clickAt(page, target, tempo),
    fill: (target, text) => fillField(page, target, text, tempo),
    // Scaled by the tempo so scene pauses stretch or compress with the rest.
    hold: (ms) => page.waitForTimeout(ms * tempo.scale),
  };
}
