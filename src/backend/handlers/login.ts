import type { ContentfulStatusCode } from "hono/utils/http-status";

import * as z from "zod";

import type { AuthConfig } from "#backend/config.ts";
import type { SessionStore } from "#backend/session.ts";

import { safeEqual } from "#backend/http-boundary.ts";

const loginBodySchema = z.object({
  password: z.string(),
});

export type LoginResult =
  | { ok: true; sessionId: string }
  | { ok: false; status: ContentfulStatusCode };

export async function handlePostLogin(
  request: Request,
  authConfig: AuthConfig,
  sessions: Pick<SessionStore, "create">,
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

  return { ok: true, sessionId: sessions.create() };
}
