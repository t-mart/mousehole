// A fake, somewhat human mouse cursor for the recording. Playwright's own
// pointer never shows up in video, so we inject a DOM cursor overlay. The
// cursor is a *passive follower*: it's driven directly (we animate it to
// wherever the next interaction will land), never by the real pointer.
// Interactions are then activated through element-level APIs (dispatchEvent /
// focus / keyboard) rather than hardware clicks, so nothing the page does to
// the real mouse can move the overlay. That decoupling is what keeps it from
// twitching on click: we kept on running into a bug where the cursor would
// briefly jump back to the center of the page on click.

import type { Locator, Page } from "playwright";

import type { JitterRange, Tempo } from "./tempo.ts";

// Pre-scaled travel timing handed to the in-page glide (see Tempo.move).
type MoveTiming = Tempo["move"];

// Control surface the injected script exposes on the page, called from Node via
// page.evaluate. (x, y) are viewport coordinates of the cursor's tip.
interface DemoCursorApi {
  set: (x: number, y: number) => void;
  glideTo: (x: number, y: number, move: MoveTiming) => Promise<void>;
  ripple: () => void;
}

type CursorGlobal = typeof globalThis & {
  __demoCursor?: boolean;
  __demoCursorApi?: DemoCursorApi;
};

const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

const jitter = (base: number, spread: number) => base + Math.random() * spread;

// A jittered duration from a Range, multiplied by the tempo's master scale.
const draw = (range: JitterRange, scale: number): number =>
  jitter(range.base, range.spread) * scale;

// Tempo.move with the master scale folded in, ready to hand to the in-page
// glide (which clamps distance * msPerPx into [minMs, maxMs]).
const scaleMove = (tempo: Tempo): MoveTiming => ({
  msPerPx: tempo.move.msPerPx * tempo.scale,
  minMs: tempo.move.minMs * tempo.scale,
  maxMs: tempo.move.maxMs * tempo.scale,
});

// Runs in the page on every navigation. Builds the cursor element and publishes
// __demoCursorApi. No pointer-event listeners: the overlay only ever moves when
// we tell it to.
function cursorScript(): void {
  const cursorGlobal = globalThis as CursorGlobal;
  // documentElement is null at document-start (this runs before <html>), so the
  // guard lives on the global object, which always exists.
  if (cursorGlobal.__demoCursor) return;
  cursorGlobal.__demoCursor = true;

  // The arrow tip's offset within the 22px box; we translate by (point - tip) so
  // the visible tip lands exactly on the target point.
  const tipX = 4;
  const tipY = 2;

  const cursor = document.createElement("div");
  cursor.setAttribute("aria-hidden", "true");
  cursor.style.cssText =
    "position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;" +
    "width:22px;height:22px;transform:translate(-60px,-60px);" +
    "will-change:transform;filter:drop-shadow(0 1px 2px rgba(0,0,0,.45));";
  cursor.innerHTML =
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none">' +
    '<path d="M4 2 L4 18 L8.5 13.8 L11.4 20.4 L13.8 19.3 L11 12.9 L17 12.9 Z" ' +
    'fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>';

  let positionX = -60;
  let positionY = -60;

  const ensureAttached = (): void => {
    if (!cursor.isConnected && document.body) document.body.append(cursor);
  };

  const place = (): void => {
    cursor.style.transform = `translate(${Math.round(positionX - tipX)}px, ${Math.round(positionY - tipY)}px)`;
  };

  const api: DemoCursorApi = {
    set(x, y) {
      positionX = x;
      positionY = y;
      ensureAttached();
      place();
    },

    // Eased, slightly-bowed glide to (x, y), animated in-page at the page's frame
    // rate. Resolves when the move finishes.
    glideTo(x, y, move) {
      return new Promise<void>((resolve) => {
        const startX = positionX;
        const startY = positionY;
        const deltaX = x - startX;
        const deltaY = y - startY;
        const distance = Math.hypot(deltaX, deltaY) || 1;
        const duration = Math.min(
          move.maxMs,
          Math.max(move.minMs, distance * move.msPerPx),
        );

        // Bow the path sideways so it arcs like a hand instead of a ruler.
        const bow = (Math.random() * 2 - 1) * Math.min(36, distance * 0.18);
        const controlX = startX + deltaX * 0.5 + (-deltaY / distance) * bow;
        const controlY = startY + deltaY * 0.5 + (deltaX / distance) * bow;

        const startTime = performance.now();
        ensureAttached();
        const step = (now: number): void => {
          const linear = Math.min(1, (now - startTime) / duration);
          const eased =
            linear < 0.5 ? 2 * linear * linear : 1 - (-2 * linear + 2) ** 2 / 2;
          const inverse = 1 - eased;
          positionX =
            inverse * inverse * startX +
            2 * inverse * eased * controlX +
            eased * eased * x;
          positionY =
            inverse * inverse * startY +
            2 * inverse * eased * controlY +
            eased * eased * y;
          place();
          if (linear < 1) requestAnimationFrame(step);
          else resolve();
        };
        requestAnimationFrame(step);
      });
    },

    // A click ripple at the current tip position. Pure feedback; never moves the
    // cursor.
    ripple() {
      if (!document.body) return;
      const ring = document.createElement("div");
      ring.style.cssText =
        `position:fixed;left:${positionX}px;top:${positionY}px;` +
        "z-index:2147483646;pointer-events:none;width:14px;height:14px;" +
        "margin:-7px 0 0 -7px;border:2px solid rgba(120,170,255,.95);" +
        "border-radius:50%;transform:scale(.3);opacity:.9;" +
        "transition:transform 380ms ease-out,opacity 380ms ease-out;";
      document.body.append(ring);
      requestAnimationFrame(() => {
        ring.style.transform = "scale(4)";
        ring.style.opacity = "0";
      });
      setTimeout(() => ring.remove(), 420);
    },
  };

  cursorGlobal.__demoCursorApi = api;

  if (document.body) ensureAttached();
  else
    globalThis.addEventListener("DOMContentLoaded", ensureAttached, {
      once: true,
    });
}

export async function installCursor(page: Page): Promise<void> {
  await page.addInitScript(cursorScript);
}

// Drop the cursor at (x, y) with no animation (used to plant it on load).
export async function placeCursor(
  page: Page,
  x: number,
  y: number,
): Promise<void> {
  await page.evaluate(
    ([px, py]) => (globalThis as CursorGlobal).__demoCursorApi?.set(px, py),
    [x, y] as const,
  );
}

async function glide(
  page: Page,
  x: number,
  y: number,
  move: MoveTiming,
): Promise<void> {
  await page.evaluate(
    ([tx, ty, timing]) => {
      const cursorApi = (globalThis as CursorGlobal).__demoCursorApi;
      return cursorApi ? cursorApi.glideTo(tx, ty, timing) : undefined;
    },
    [x, y, move] as const,
  );
}

async function ripple(page: Page): Promise<void> {
  await page.evaluate(() =>
    (globalThis as CursorGlobal).__demoCursorApi?.ripple(),
  );
}

// A point inside the locator's box to aim the cursor at (slightly randomized so
// it doesn't always land dead-center).
async function aimPoint(locator: Locator): Promise<{ x: number; y: number }> {
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  await locator.waitFor({ state: "visible" });
  const box = await locator.boundingBox();
  if (!box) throw new Error("cannot aim at an element with no bounding box");
  return {
    x: box.x + box.width * (0.4 + Math.random() * 0.2),
    y: box.y + box.height * (0.45 + Math.random() * 0.1),
  };
}

// Glide the cursor to the element and activate it with a real DOM click event
// (no hardware pointer), so the overlay stays put while the button fires.
export async function clickAt(
  page: Page,
  locator: Locator,
  tempo: Tempo,
): Promise<void> {
  const { x, y } = await aimPoint(locator);
  await glide(page, x, y, scaleMove(tempo));
  await sleep(draw(tempo.pause.beforePress, tempo.scale)); // settle before pressing
  await ripple(page);
  await sleep(draw(tempo.pause.afterPress, tempo.scale));
  await locator.dispatchEvent("click");
}

// Glide to the field, focus it (no pointer), then type with the keyboard.
export async function fillField(
  page: Page,
  locator: Locator,
  text: string,
  tempo: Tempo,
): Promise<void> {
  const { x, y } = await aimPoint(locator);
  await glide(page, x, y, scaleMove(tempo));
  await sleep(draw(tempo.pause.beforePress, tempo.scale));
  await ripple(page);
  await locator.focus();
  await sleep(tempo.pause.afterFocus * tempo.scale);

  const perChar = tempo.type.perChar;
  if (perChar.base === 0 && perChar.spread === 0) {
    await locator.fill(text);
  } else {
    for (const character of text) {
      await page.keyboard.type(character);
      await sleep(draw(tempo.type.perChar, tempo.scale));
    }
  }
}
