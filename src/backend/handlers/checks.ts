import type { PublicState } from "#backend/serde.ts";
import type { JSONResponseArgs } from "#backend/types.ts";

import { commitContact } from "#backend/contact.ts";

import { makePublicState } from "./state.ts";

// POST /checks — run a contact now and return the resulting state.
export async function handlePostCheck(): Promise<
  JSONResponseArgs<PublicState>
> {
  const state = await commitContact();
  return { body: makePublicState(state) };
}
