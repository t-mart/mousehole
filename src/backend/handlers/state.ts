import type { AppContext } from "#backend/context.ts";
import type { PublicState } from "#shared/public-state.ts";

import { toPublicState, type State } from "#backend/state/serde.ts";

// Builds the public view of state with the server-derived fields filled in. Shared
// by every endpoint that returns state (GET /state, PUT /cookie, POST /updates).
export function makePublicState(
  ctx: AppContext,
  state: State | undefined,
): PublicState {
  return toPublicState(state, {
    hasAuth: ctx.config.auth.type === "configured",
    nextContactAt: ctx.contacts.getNextContactAt()?.toString(),
  });
}

export async function handleGetState(ctx: AppContext): Promise<PublicState> {
  const state = await ctx.stateFile.readIfExists();
  return makePublicState(ctx, state);
}
