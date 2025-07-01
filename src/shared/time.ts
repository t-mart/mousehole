import { Temporal } from "temporal-polyfill";

export function getNowZdt(): Temporal.ZonedDateTime {
  return Temporal.Now.zonedDateTimeISO(
    Intl.DateTimeFormat().resolvedOptions().timeZone
  );
}
