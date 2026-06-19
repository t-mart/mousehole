// The README demo: land on the dashboard already authenticated, reveal the
// cookie form if needed, then enter and submit the cookie with a human-ish
// mouse. This is the scene that used to live in the old steps.ts/runDemo.

import type { VideoCapture } from "../capture.ts";

import { webp } from "../postprocess.ts";
import { defaultTempoWith } from "../tempo.ts";

// A fake, realistic-length mam_id. The MAM it talks to is mocked, so this is
// safe to commit and is only ever shown on camera.
const PLACEHOLDER_COOKIE = Array.from({ length: 100 }, () => {
  const chars =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return chars[Math.floor(Math.random() * chars.length)];
}).join("");

export const readmeDemo: VideoCapture = {
  kind: "video",
  name: "readme-demo",
  description: "Set a cookie on the dashboard, end to end.",
  env: {
    password: process.env.MOUSEHOLE_AUTH_PASSWORD ?? "password",
    preAuthenticate: true,
    cookie: PLACEHOLDER_COOKIE,
    mam: {
      outcome: "completed",
      ip: "12.34.56.78",
      asn: 12_345,
      as: "MegaCorp Networks",
    },
  },
  postprocess: webp({
    startAtSeconds: 1,
  }),
  quality: { scale: 2 },
  tempo: defaultTempoWith({ type: { perChar: { base: 0, spread: 0 } } }),
  run: async (ctx) => {
    const { page } = ctx;

    await ctx.goto("/web/");
    await page.evaluate("document.body.style.zoom=2.0");
    await ctx.place(ctx.viewport.width / 2, ctx.viewport.height / 2); // plant the cursor
    await ctx.hold(1000);

    // The form is already shown when there's no cookie on file; otherwise a
    // "Set Cookie" button reveals it. Wait for whichever the dashboard renders.
    const revealButton = page.getByRole("button", { name: "Set Cookie" });
    const cookieInput = page.getByLabel("Cookie");
    await revealButton.or(cookieInput).first().waitFor({ state: "visible" });

    if (await revealButton.isVisible().catch(() => false)) {
      await ctx.click(revealButton);
      await ctx.hold(500);
    }

    await cookieInput.waitFor({ state: "visible" });

    if (!ctx.cookie) {
      console.warn("readme-demo has no cookie; leaving the form open.");
      await ctx.hold(2500);
      return;
    }

    await ctx.fill(cookieInput, ctx.cookie);
    await ctx.hold(500);

    await ctx.click(page.getByRole("button", { name: "Set", exact: true }));

    // Let the result render (the form closes on success).
    await ctx.hold(4000);
  },
};
