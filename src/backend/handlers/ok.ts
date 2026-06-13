import type { AppContext } from "#backend/context.ts";

import { classify, type ContactStatus } from "#shared/public-state.ts";

export type GetOkResponseBody = { ok: boolean; reason: ContactStatus };

// Deprecated alias of /health (see health.ts). A pure read of the last contact:
// `ok` when the most recent contact reached MAM and the IP update applied (MAM's
// 200). No network call. The route always answers HTTP 200 while the server is up;
// `ok`/`reason` report the MAM sync state in the body without gating the status.
export async function handleGetOk(ctx: AppContext): Promise<GetOkResponseBody> {
  const state = await ctx.stateFile.readIfExists();
  const reason = classify(state?.lastMamContact);
  return { ok: reason === "ok", reason };
}
