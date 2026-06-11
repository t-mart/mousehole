import { config } from "#backend/config.ts";
import { getNextContactAt } from "#backend/contact.ts";
import { toPublicState, type PublicState, type State } from "#backend/serde.ts";
import { stateFile } from "#backend/store.ts";

// Builds the public view of state with the server-derived fields filled in. Shared
// by every endpoint that returns state (GET /state, PUT /cookie, POST /checks).
export function makePublicState(state: State | undefined): PublicState {
  return toPublicState(state, {
    hasAuth: config.auth.type === "configured",
    nextCheckAt: getNextContactAt()?.toString(),
  });
}

export async function handleGetState(): Promise<PublicState> {
  const state = await stateFile.readIfExists();
  return makePublicState(state);
}
