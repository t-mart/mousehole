import type { AppContext } from "#backend/context.ts";

import { classify, type ContactStatus } from "#backend/serde.ts";

export type GetHealthResponseBody = { ok: boolean; reason: ContactStatus };

// A pure read of the last contact: ok when the most recent contact reached MAM and
// the IP update applied (200). No network call, so the Docker healthcheck doesn't
// hammer MAM. The route maps `ok` onto the HTTP status (200/503).
export async function handleGetHealth(
  ctx: AppContext,
): Promise<GetHealthResponseBody> {
  const state = await ctx.stateFile.readIfExists();
  const reason = classify(state?.lastMamContact);
  return { ok: reason === "ok", reason };
}
