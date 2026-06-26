import {
  formatMillisecondsAsDuration,
  relativeDateFromSeconds,
} from "#frontend/lib/date.ts";

const DAY = 86_400;

describe("relativeDateFromSeconds", () => {
  test("seconds, with a singular at one", () => {
    expect(relativeDateFromSeconds(0)).toBe("0 seconds ago");
    expect(relativeDateFromSeconds(1)).toBe("1 second ago");
    expect(relativeDateFromSeconds(89)).toBe("89 seconds ago");
  });

  // The intentional overflow: a value lags into the next unit a little late, so
  // it never steps up at the exact boundary where resolution would drop sharply.
  test("the unit lag rounds past the natural boundary", () => {
    expect(relativeDateFromSeconds(90)).toBe("2 minutes ago");
    expect(relativeDateFromSeconds(3600)).toBe("60 minutes ago");
    expect(relativeDateFromSeconds(5400)).toBe("2 hours ago");
  });

  test("weeks and months", () => {
    expect(relativeDateFromSeconds(14 * DAY)).toBe("2 weeks ago");
    expect(relativeDateFromSeconds(70 * DAY)).toBe("2 months ago");
  });

  test("years, alone and with trailing months", () => {
    expect(relativeDateFromSeconds(370 * DAY)).toBe("1 year ago");
    expect(relativeDateFromSeconds(400 * DAY)).toBe("1 year, 1 month ago");
    expect(relativeDateFromSeconds(1825 * DAY)).toBe("5 years ago");
  });

  // A negative gap is a moment in the future; the wording is symmetric about now.
  test("future moments read as 'in ...'", () => {
    expect(relativeDateFromSeconds(-1)).toBe("in 1 second");
    expect(relativeDateFromSeconds(-90)).toBe("in 2 minutes");
    expect(relativeDateFromSeconds(-3 * DAY)).toBe("in 3 days");
    expect(relativeDateFromSeconds(-400 * DAY)).toBe("in 1 year, 1 month");
  });
});

describe("formatMillisecondsAsDuration", () => {
  describe("unit selection follows maxMilliseconds, not the current value", () => {
    test("seconds only when the cap is under a minute", () => {
      expect(formatMillisecondsAsDuration(5000, 30_000)).toBe("05");
      expect(formatMillisecondsAsDuration(58_000, 59_999)).toBe("58");
    });

    test("minutes appear once the cap reaches a minute (>= 60_000)", () => {
      expect(formatMillisecondsAsDuration(58_000, 60_000)).toBe("00:58");
      expect(formatMillisecondsAsDuration(64_000, 90_000)).toBe("01:04");
    });

    test("hours appear once the cap reaches an hour (>= 3_600_000)", () => {
      expect(formatMillisecondsAsDuration(64_000, 3_600_000)).toBe("00:01:04");
      expect(formatMillisecondsAsDuration(3_661_000, 3_600_000)).toBe(
        "01:01:01",
      );
    });
  });

  describe("a minute-scale cap keeps the minutes column under a minute", () => {
    // The whole point: a sub-minute value still shows minutes when the cap is
    // minute-scale, so a counting-down display doesn't lose/gain a column.
    test.each([
      [64_000, "01:04"],
      [60_000, "01:00"],
      [59_000, "00:59"],
      [58_000, "00:58"],
      [0, "00:00"],
    ])("%i ms with a 5-minute cap -> %s", (ms, expected) => {
      expect(formatMillisecondsAsDuration(ms, 300_000)).toBe(expected);
    });
  });

  describe("default cap shows exactly the units the single value needs", () => {
    test("sub-minute value -> seconds only", () => {
      expect(formatMillisecondsAsDuration(5000)).toBe("05");
    });
    test("minute-scale value -> MM:SS", () => {
      expect(formatMillisecondsAsDuration(64_000)).toBe("01:04");
    });
    test("hour-scale value -> HH:MM:SS", () => {
      expect(formatMillisecondsAsDuration(3_661_000)).toBe("01:01:01");
    });
  });

  describe("rounding and clamping", () => {
    test("floors sub-second remainders", () => {
      expect(formatMillisecondsAsDuration(1999, 90_000)).toBe("00:01");
    });

    test("clamps negatives to zero while keeping the cap's units", () => {
      expect(formatMillisecondsAsDuration(-5000, 30_000)).toBe("00");
      expect(formatMillisecondsAsDuration(-5000, 300_000)).toBe("00:00");
      expect(formatMillisecondsAsDuration(-5000, 3_600_000)).toBe("00:00:00");
    });
  });

  describe("the highest shown unit absorbs overflow rather than wrapping", () => {
    test("value over a minute-scale cap grows the minutes column past 59", () => {
      // 65 minutes under an MM:SS cap: minutes is the top unit, so no wrap.
      expect(formatMillisecondsAsDuration(3_900_000, 300_000)).toBe("65:00");
    });

    test("value over a seconds-scale cap grows the seconds column past 59", () => {
      expect(formatMillisecondsAsDuration(75_000, 30_000)).toBe("75");
    });
  });
});
