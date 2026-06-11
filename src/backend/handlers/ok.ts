import type { AppContext } from "#backend/context.ts";

import { classify, type ContactStatus } from "#backend/serde.ts";

export type GetOkResponseBody = { ok: boolean; reason: ContactStatus };

// A pure read of the last contact: ok when the most recent contact reached MAM and
// the IP update applied (200). No network call. The route maps `ok` onto the HTTP
// status (200/503).
export async function handleGetOk(ctx: AppContext): Promise<GetOkResponseBody> {
  const state = await ctx.stateFile.readIfExists();
  const reason = classify(state?.lastMamContact);
  return { ok: reason === "ok", reason };
}
