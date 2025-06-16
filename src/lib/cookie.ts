import path from "node:path";

import { config } from "./config.ts";
import { NoCookieError } from "./error.ts";

const cookieFilePath = path.join(config.stateDirPath, "cookie.txt");

export async function readCookieValue() {
  const file = Bun.file(cookieFilePath);
  let contents;
  try {
    contents = await file.text();
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw new NoCookieError();
    }
    throw error;
  }
  return contents;
}

export async function writeCookieValue(value: string) {
  const file = Bun.file(cookieFilePath);
  await file.write(value);
}
