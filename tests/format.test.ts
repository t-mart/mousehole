import { formatMillisecondsAsDuration } from "#frontend/lib/format.ts";

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
