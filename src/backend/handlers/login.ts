import * as z from "zod";

import type { AuthConfig } from "#backend/config.ts";

import { config } from "#backend/config.ts";
import { safeEqual } from "#backend/http-boundary.ts";
import { createSession } from "#backend/session.ts";

const loginBodySchema = z.object({
  password: z.string(),
});

export type LoginResult =
  | { ok: true; sessionId: string }
  | { ok: false; status: number };

export async function handlePostLogin(
  request: Request,
  authConfig: AuthConfig = config.auth,
): Promise<LoginResult> {
  if (authConfig.type !== "configured" || !authConfig.password) {
    return { ok: false, status: 500 };
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { ok: false, status: 400 };
  }

  const parsed = loginBodySchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, status: 400 };
  }

  if (!safeEqual(parsed.data.password, authConfig.password)) {
    return { ok: false, status: 401 };
  }

  return { ok: true, sessionId: createSession() };
}
