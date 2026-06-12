import type { AppContext } from "#backend/context.ts";
import type { PublicState } from "#shared/public-state.ts";

import { makePublicState } from "./state.ts";

// POST /updates — contact MAM now and return the resulting state.
export async function handlePostUpdate(ctx: AppContext): Promise<PublicState> {
  const state = await ctx.contacts.commitContact();
  return makePublicState(ctx, state);
}
