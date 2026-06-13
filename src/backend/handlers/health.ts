import type { AppContext } from "#backend/context.ts";

import { classify, type ContactStatus } from "#shared/public-state.ts";

export type GetHealthResponseBody = {
  sync: { ok: boolean; reason: ContactStatus };
};

// A pure read of the last contact: `ok` when the most recent contact reached MAM
// and the IP update applied (MAM's 200). No network call, so the Docker
// healthcheck doesn't hammer MAM. The route always answers HTTP 200 while the
// server is up (a liveness signal); `ok`/`reason` report the MAM sync state in
// the body without gating the status, so the container stays healthy even when
// the user must intervene.
export async function handleGetHealth(
  ctx: AppContext,
): Promise<GetHealthResponseBody> {
  const state = await ctx.stateFile.readIfExists();
  const reason = classify(state?.lastMamContact);
  return { sync: { ok: reason === "ok", reason } };
}
