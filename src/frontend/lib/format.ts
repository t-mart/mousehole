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
