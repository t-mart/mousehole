import path from "node:path";
import { Temporal } from "temporal-polyfill";

import { config } from "./config.js";

type Attempt = {
  success: boolean;
  message: string;
  publicIp?: string;
  oldCookieValue?: string;
  newCookieValue?: string;
  responseJson?: unknown;
  datetime: Temporal.ZonedDateTime;
};

const lastResponsePath = path.join(config.stateDirPath, "last-response.json");

export async function writeLastAttempt(attemptData: Omit<Attempt, "datetime">) {
  const attempt = {
    ...attemptData,
    datetime: Temporal.Now.zonedDateTimeISO(config.localTimezone),
  };

  const lastResponseFile = Bun.file(lastResponsePath);
  try {
    await lastResponseFile.write(JSON.stringify(attempt, undefined, 2));
  } catch (error) {
    throw new Error(
      `Error writing last attempt file at ${lastResponsePath}: ${String(
        error
      )}`,
      { cause: error }
    );
  }
}

export async function readLastAttempt() {
  const lastResponseFile = Bun.file(lastResponsePath);
  let contents;
  try {
    contents = await lastResponseFile.text();
  } catch (error) {
    throw new Error(
      `Error reading last attempt file at ${lastResponsePath}: ${String(
        error
      )}`,
      { cause: error }
    );
  }
  if (!contents) {
    throw new TypeError(
      `Last attempt file at ${lastResponsePath} is empty.`
    );
  }
  return JSON.parse(contents);
}
