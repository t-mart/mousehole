import { useEffect, useState } from "react";
import { Temporal } from "temporal-polyfill";

import type { GetStateResponseBody } from "#backend/types.ts";

import { formatMillisecondsAsDuration } from "#frontend/lib/format.ts";

import { Section } from "./section";

export function Timer({ data }: Readonly<{ data: GetStateResponseBody }>) {
  const nextUpdateAt = data?.nextUpdateAt;
  const nextUpdateAtZdt = nextUpdateAt
    ? Temporal.ZonedDateTime.from(nextUpdateAt)
    : undefined;

  const [timeLeftMilliseconds, setTimeLeftMilliseconds] = useState<
    number | undefined
  >();

  useEffect(() => {
    if (nextUpdateAtZdt) {
      setTimeLeftMilliseconds(getDifferenceMilliseconds(nextUpdateAtZdt));

      const interval = setInterval(() => {
        setTimeLeftMilliseconds(getDifferenceMilliseconds(nextUpdateAtZdt));
      }, 1000);

      return () => clearInterval(interval);
    }
    setTimeLeftMilliseconds(undefined);
  }, [nextUpdateAtZdt]);

  return (
    <Section className="flex-col">
      <h2 className="sr-only">Updater</h2>

      <p className="text-center w-full">Time Until Next Check</p>

      {timeLeftMilliseconds === undefined ? (
        "blah"
      ) : (
        <p className="text-3xl font-mono">
          {formatMillisecondsAsDuration(timeLeftMilliseconds)}
        </p>
      )}
    </Section>
  );
}

function getDifferenceMilliseconds(
  nextUpdateAt: Temporal.ZonedDateTime
): number {
  const now = Temporal.Now.instant();
  return nextUpdateAt.epochMilliseconds - now.epochMilliseconds;
}
