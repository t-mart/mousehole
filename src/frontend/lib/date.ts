import { Temporal } from "temporal-polyfill";

// Date and duration formatting helpers.

// ── relative dates ────────────────────────────────────────────────────────────

// A port of git's relative-date formatter (show_date_relative in date.c). It
// describes the distance between two moments in a single coarse unit: "5 minutes
// ago", "3 weeks ago", "in 2 days".
//
// The unit conversions intentionally carry a little overflow. Each step rounds
// before comparing against the next threshold (e.g. minutes via (diff + 30) / 60),
// and the thresholds sit a bit past the natural unit boundary (seconds run to 90,
// minutes to 90, hours to 36, days to 14). The effect is that a value lags into
// the next unit a little late, rather than stepping up the moment it technically
// could, where the resolution drop would be jarring. So 90 seconds reads as "2
// minutes" and one hour reads as "60 minutes".

// Any Temporal point in time: both `Temporal.Instant` and
// `Temporal.ZonedDateTime` expose `epochMilliseconds`, which is all we need to
// measure a distance, so callers can pass either without converting.
type Instantish = { readonly epochMilliseconds: number };

function plural(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? "" : "s"}`;
}

// The bare magnitude of a non-negative gap, e.g. "5 minutes" or "1 year, 1 month".
function describeGap(diffSeconds: number): string {
  let diff = Math.floor(diffSeconds);
  if (diff < 90) return plural(diff, "second");

  // Turn it into minutes.
  diff = Math.floor((diff + 30) / 60);
  if (diff < 90) return plural(diff, "minute");

  // Turn it into hours.
  diff = Math.floor((diff + 30) / 60);
  if (diff < 36) return plural(diff, "hour");

  // We deal with number of days from here on.
  diff = Math.floor((diff + 12) / 24);
  if (diff < 14) return plural(diff, "day");

  // Say weeks for the past 10 weeks or so.
  if (diff < 70) return plural(Math.floor((diff + 3) / 7), "week");

  // Say months for the past 12 months or so.
  if (diff < 365) return plural(Math.floor((diff + 15) / 30), "month");

  // Give years and months for 5 years or so.
  if (diff < 1825) {
    const totalMonths = Math.floor((diff * 12 * 2 + 365) / (365 * 2));
    const years = Math.floor(totalMonths / 12);
    const months = totalMonths % 12;
    if (months) return `${plural(years, "year")}, ${plural(months, "month")}`;
    return plural(years, "year");
  }

  // Otherwise, just years. Centuries is probably overkill.
  return plural(Math.floor((diff + 183) / 365), "year");
}

/**
 * Describe `diffSeconds`, the gap from now to the moment in question (now minus
 * that moment, in seconds), as a relative phrase. The wording is symmetric about
 * now: a positive gap is in the past ("5 minutes ago"), a negative gap is in the
 * future ("in 5 minutes"). `relativeDate` is the convenience that computes the
 * gap for you.
 */
export function relativeDateFromSeconds(diffSeconds: number): string {
  if (diffSeconds < 0) return `in ${describeGap(-diffSeconds)}`;
  return `${describeGap(diffSeconds)} ago`;
}

/**
 * Describe where `at` sits relative to `now` (defaulting to the current time):
 * "3 days ago", "in 2 hours". Accepts any Temporal point in time (an `Instant`
 * or a `ZonedDateTime`). See `relativeDateFromSeconds` for the wording rules.
 */
export function relativeDate(
  at: Instantish,
  now: Instantish = Temporal.Now.instant(),
): string {
  const diffSeconds = (now.epochMilliseconds - at.epochMilliseconds) / 1000;
  return relativeDateFromSeconds(diffSeconds);
}

// ── durations ─────────────────────────────────────────────────────────────────

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;

const pad = (value: number): string => String(value).padStart(2, "0");

/**
 * Formats `milliseconds` as a colon-separated, zero-padded duration. Which units
 * appear is driven by `maxMilliseconds` — the largest value the duration can
 * reach — not the current value, so a counting-down display keeps a stable
 * width: minutes appear once the cap reaches a minute (>= 60_000), hours once it
 * reaches an hour (>= 3_600_000). Seconds always appear, and the highest shown
 * unit absorbs any overflow rather than wrapping. `maxMilliseconds` defaults to
 * `milliseconds` — i.e. show exactly the units this single value needs.
 *
 *   formatMillisecondsAsDuration(58_000, 90_000)    -> "00:58"
 *   formatMillisecondsAsDuration(64_000, 90_000)    -> "01:04"
 *   formatMillisecondsAsDuration(5_000, 30_000)     -> "05"
 *   formatMillisecondsAsDuration(64_000, 3_600_000) -> "00:01:04"
 */
export function formatMillisecondsAsDuration(
  milliseconds: number,
  maxMilliseconds: number = milliseconds,
): string {
  if (milliseconds < 0) {
    return formatMillisecondsAsDuration(0, maxMilliseconds);
  }

  const totalSeconds = Math.floor(milliseconds / 1000);
  const showHours = maxMilliseconds >= MS_PER_HOUR;
  const showMinutes = maxMilliseconds >= MS_PER_MINUTE;

  const parts: string[] = [];
  if (showHours) {
    parts.push(pad(Math.floor(totalSeconds / 3600)));
  }
  if (showMinutes) {
    // Minutes wrap at 60 only when hours are shown to carry the overflow;
    // otherwise minutes are the top unit and absorb it.
    const minutes = showHours
      ? Math.floor(totalSeconds / 60) % 60
      : Math.floor(totalSeconds / 60);
    parts.push(pad(minutes));
  }
  // Seconds wrap at 60 only when a larger unit is present to carry the overflow.
  parts.push(pad(showMinutes ? totalSeconds % 60 : totalSeconds));

  return parts.join(":");
}
