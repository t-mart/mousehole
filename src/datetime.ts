import type { Temporal } from "temporal-polyfill";

export type Datetime = {
  datetime: string;
  timestampMilliseconds: number;
};

export function makeDatetime(zdt: Temporal.ZonedDateTime): Datetime {
  return {
    datetime: zdt.toString(),
    timestampMilliseconds: zdt.toInstant().epochMilliseconds,
  };
}
