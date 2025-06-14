import path from "node:path";

import { config } from "./config.js";
import { setCookiePath } from "./index.js";

const cookiePath = path.join(config.stateDirPath, "cookie.txt");

export async function readCookieValue() {
  const file = Bun.file(cookiePath);
  let contents;
  try {
    contents = await file.text();
  } catch (error) {
    throw new Error(
      `Error reading cookie file at ${cookiePath}: ${String(
        error
      )}. Are you sure you've initialized the cookie with the ${setCookiePath} endpoint?`,
      { cause: error }
    );
  }
  const value = contents.trim();
  return value;
}

export async function writeCookieValue(value: string) {
  const file = Bun.file(cookiePath);
  await file.write(value);
}
