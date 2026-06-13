import * as z from "zod";

import type { AppContext } from "#backend/context.ts";
import type { PublicState } from "#shared/public-state.ts";

import { JSONParseError, SchemaError, toError } from "#backend/error.ts";

import { makePublicState } from "./state.ts";

// A non-empty cookie value is required; clearing a stored cookie via the API
// is deliberately not supported (delete state.json instead).
const putCookieRequestBodySchema = z.object({
  value: z.string().min(1),
});

export async function handlePutCookie(
  ctx: AppContext,
  request: Request,
): Promise<PublicState> {
  const json = await parseRequestJson(request);
  const { data, error } = putCookieRequestBodySchema.safeParse(json);
  if (error) throw SchemaError.fromUserSource("request body", { cause: error });

  const state = await ctx.contacts.commitContact(data.value);
  return makePublicState(ctx, state);
}

// Parse the request body as JSON: an empty body is `undefined`, a malformed
// one is a typed 400.
async function parseRequestJson(request: Request): Promise<unknown> {
  const content = await request.text();
  if (!content) {
    return undefined;
  }
  try {
    return JSON.parse(content);
  } catch (error) {
    throw JSONParseError.fromRequest(request, { cause: toError(error) });
  }
}
