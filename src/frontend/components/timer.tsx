import { useEffect, useState } from "react";
import { Temporal } from "temporal-polyfill";

import { formatMillisecondsAsDuration } from "#frontend/lib/format.ts";
import { getNowZdt } from "#shared/time.ts";

import { Section } from "./section";

export function Timer({ nextUpdateAt }: Readonly<{ nextUpdateAt: Temporal.ZonedDateTime }>) {
  const [now, setNow] = useState<Temporal.ZonedDateTime>(() => getNowZdt());

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(getNowZdt());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const timeLeftMilliseconds = nextUpdateAt.epochMilliseconds - now.epochMilliseconds;

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
