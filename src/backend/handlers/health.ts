import type { AppContext } from "#backend/context.ts";

import { classify, type ContactStatus } from "#shared/public-state.ts";

export type GetHealthResponseBody = {
  lastMamContactResult: ContactStatus;
};

// A pure read of the last contact. No network call. This function
// returns (and thus responds with a 200) while the server is
// up and able to read its persisted state.
export async function handleGetHealth(
  ctx: AppContext,
): Promise<GetHealthResponseBody> {
  const state = await ctx.stateFile.readIfExists();
  const reason = classify(state?.lastMamContact);
  return { lastMamContactResult: reason };
}
