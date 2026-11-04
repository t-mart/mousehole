import { Temporal } from "temporal-polyfill";

export function parseZonedDateTime(value: string): Temporal.ZonedDateTime {
  // Recorded instants must survive timezone-rule changes between runtimes.
  return Temporal.ZonedDateTime.from(value, { offset: "use" });
}

export function getNowZdt(): Temporal.ZonedDateTime {
  return Temporal.Now.zonedDateTimeISO(
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
}
