import { Temporal } from "temporal-polyfill";

import { parseZonedDateTime } from "#shared/time.ts";

describe("parseZonedDateTime", () => {
  test.each([
    "2026-11-04T12:09:17.461-08:00[America/Vancouver]",
    "2026-11-04T12:09:17.461-07:00[America/Vancouver]",
    "2026-11-04T12:09:17.461+01:00[UTC]",
    "2026-11-04T20:09:17.461+00:00[UTC]",
  ])("preserves the explicit offset's instant: %s", (timestamp) => {
    expect(parseZonedDateTime(timestamp).epochNanoseconds).toBe(
      Temporal.Instant.from(timestamp).epochNanoseconds,
    );
  });

  test("keeps the zone annotation", () => {
    expect(
      parseZonedDateTime("2026-11-04T12:09:17.461-08:00[America/Vancouver]")
        .timeZoneId,
    ).toBe("America/Vancouver");
  });

  test("keeps repeated DST wall times distinct", () => {
    const first = parseZonedDateTime(
      "2025-11-02T01:30:00-07:00[America/Vancouver]",
    );
    const second = parseZonedDateTime(
      "2025-11-02T01:30:00-08:00[America/Vancouver]",
    );

    expect(second.epochMilliseconds - first.epochMilliseconds).toBe(3_600_000);
  });

  test.each([
    "not-a-timestamp",
    "2026-13-04T12:09:17+00:00[UTC]",
    "2026-11-04T12:09:17+25:00[UTC]",
    "2026-11-04T12:09:17+00:00[Not/AZone]",
  ])("still rejects invalid timestamps: %s", (timestamp) => {
    expect(() => parseZonedDateTime(timestamp)).toThrow(RangeError);
  });
});
