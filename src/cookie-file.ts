import path from "node:path";

import { config } from "./config.js";

const cookiePath = path.join(config.stateDirPath, "cookie.txt");

export async function readCookieValue() {
  const file = Bun.file(cookiePath);
  let contents;
  try {
    contents = await file.text();
  } catch (error) {
    throw new Error(
      `Error reading cookie file at ${cookiePath}: ${String(error)}`,
      { cause: error }
    );
  }
  const value = contents.trim();
  if (!value) {
    throw new TypeError(`Cookie file at ${cookiePath} is empty.`);
  }
  return value;
}

export async function writeCookieValue(value: string) {
  const file = Bun.file(cookiePath);
  try {
    await file.write(value);
  } catch (error) {
    throw new Error(
      `Error writing cookie file at ${cookiePath}: ${String(error)}`,
      { cause: error }
    );
  }
}
