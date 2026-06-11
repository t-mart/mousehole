import type { AppContext } from "#backend/context.ts";

import { toPublicState, type PublicState, type State } from "#backend/serde.ts";

// Builds the public view of state with the server-derived fields filled in. Shared
// by every endpoint that returns state (GET /state, PUT /cookie, POST /checks).
export function makePublicState(
  ctx: AppContext,
  state: State | undefined,
): PublicState {
  return toPublicState(state, {
    hasAuth: ctx.config.auth.type === "configured",
    nextCheckAt: ctx.contacts.getNextContactAt()?.toString(),
  });
}

export async function handleGetState(ctx: AppContext): Promise<PublicState> {
  const state = await ctx.stateFile.readIfExists();
  return makePublicState(ctx, state);
}
