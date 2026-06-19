// Central tuning for the recorded demo's pacing. Every pause the synthetic
// cursor and typist introduce is derived from these values, so this is the one
// place to make a recording faster or slower. All durations are milliseconds.

// A jittered duration: each draw is `base` plus a random amount up to `spread`,
// so repeated motions feel hand-made instead of metronomic. Keeping the random
// spread is deliberate; it's what reads as "human".
import { mergeDeep } from "remeda";

export interface JitterRange {
  base: number;
  spread: number;
}

export interface Tempo {
  // Master multiplier applied to every duration below. 1 keeps the tuned values
  // as-is; 1.5 makes the whole performance 50% slower while preserving its
  // rhythm; 0.7 speeds it up. Tune this first (via --speed), then reach for the
  // per-action fields only if a specific phase still feels off.
  scale: number;

  // How long the cursor takes to travel to its target, as a function of the
  // on-screen distance it has to cover.
  move: {
    // Milliseconds of travel per pixel of distance, before clamping.
    msPerPx: number;
    // Lower bound, so short hops still register as deliberate movement.
    minMs: number;
    // Upper bound, so long sweeps across the page don't crawl.
    maxMs: number;
  };

  // Per-character typing cadence.
  type: {
    // Delay after each character for ordinary-length text.
    perChar: JitterRange;
  };

  // Dwell pauses bracketing an interaction, so nothing happens instantly.
  pause: {
    // After the cursor arrives, before the click ripple and activation.
    beforePress: JitterRange;
    // After the ripple, before the click event is actually dispatched.
    afterPress: JitterRange;
    // After focusing a field, before the first keystroke lands.
    afterFocus: number;
  };
}

// The tuned baseline. These are the values the demo ran with before the tempo
// config existed; scale 1 reproduces that exactly.
export const DEFAULT_TEMPO: Tempo = {
  scale: 1,
  move: { msPerPx: 1.8, minMs: 200, maxMs: 850 },
  type: {
    perChar: { base: 40, spread: 80 },
  },
  pause: {
    beforePress: { base: 110, spread: 120 },
    afterPress: { base: 60, spread: 60 },
    afterFocus: 140,
  },
};

export function defaultTempoWith(overrides: Partial<Tempo>): Tempo {
  // remeda's mergeDeep carries the source's optional modifiers into its return
  // type, so a Partial source yields an all-optional result. The runtime value
  // is a complete Tempo because DEFAULT_TEMPO is, so the assertion is sound.
  return mergeDeep(DEFAULT_TEMPO, overrides) as Tempo;
}
