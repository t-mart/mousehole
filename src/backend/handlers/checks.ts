import type { AppContext } from "#backend/context.ts";
import type { PublicState } from "#backend/serde.ts";

import { makePublicState } from "./state.ts";

// POST /checks — run a contact now and return the resulting state.
export async function handlePostCheck(ctx: AppContext): Promise<PublicState> {
  const state = await ctx.contacts.commitContact();
  return makePublicState(ctx, state);
}
