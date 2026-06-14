import { type CSSProperties, useEffect, useState } from "react";
import { Temporal } from "temporal-polyfill";

import { formatMillisecondsAsDuration } from "#frontend/lib/format.ts";

// Fixed ring geometry. The dash is the full circumference, so a
// stroke-dashoffset of 0 shows the whole ring and `CIRCUMFERENCE` hides it —
// the two ends of the CSS depletion below.
const RADIUS = 9;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

// The ring depletes purely in CSS: one `donut-deplete` animation sweeps
// stroke-dashoffset 0 → circumference across the *entire* wait, and a negative
// `animation-delay` fast-forwards it to the current moment. The browser then
// interpolates continuously at the display's refresh rate — no per-second JS
// retargeting, so it never jerks. The elapsed-at-mount is captured once: a delay
// that changed on re-render would restart the animation. Fresh data re-mounts
// this whole subtree via the keyed status card (see dashboard.tsx).
function Donut({ atMs, nextMs }: Readonly<{ atMs: number; nextMs: number }>) {
  const [mountMs] = useState(() => Date.now());
  const total = nextMs - atMs;
  const elapsed = mountMs - atMs;

  // Degenerate/inverted interval (clock skew): no animation, just an empty ring.
  const depleting = total > 0;

  return (
    <svg viewBox="0 0 24 24" className="size-6 -rotate-90 shrink-0" aria-hidden>
      <circle
        cx="12"
        cy="12"
        r={RADIUS}
        fill="none"
        strokeWidth="3"
        className="stroke-muted-background"
      />
      <circle
        cx="12"
        cy="12"
        r={RADIUS}
        fill="none"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={CIRCUMFERENCE}
        strokeDashoffset={depleting ? undefined : CIRCUMFERENCE}
        className="stroke-text"
        style={
          depleting
            ? ({
                "--donut-circ": CIRCUMFERENCE,
                animation: `donut-deplete ${total}ms linear ${-elapsed}ms forwards`,
              } as CSSProperties)
            : undefined
        }
      />
    </svg>
  );
}

// Ticks once a second to show the time remaining. Isolated from `Donut` so the
// CSS-animated ring isn't re-rendered every second (which would restart it).
// The full wait (`nextMs - atMs`) caps which units the duration shows, so the
// width stays stable as it counts down (e.g. a 5-minute wait stays MM:SS).
function Countdown({ atMs, nextMs }: Readonly<{ atMs: number; nextMs: number }>) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <span className="font-mono">
      {formatMillisecondsAsDuration(nextMs - nowMs, nextMs - atMs)}
    </span>
  );
}

// Donut + monospaced countdown to `nextContactAt`, sized to drop into a `dd`.
export function NextUpdate({
  at,
  nextContactAt,
}: Readonly<{
  at: Temporal.ZonedDateTime;
  nextContactAt: Temporal.ZonedDateTime;
}>) {
  const atMs = at.epochMilliseconds;
  const nextMs = nextContactAt.epochMilliseconds;

  return (
    <span className="inline-flex items-center gap-2">
      <Donut atMs={atMs} nextMs={nextMs} />
      <Countdown atMs={atMs} nextMs={nextMs} />
    </span>
  );
}
