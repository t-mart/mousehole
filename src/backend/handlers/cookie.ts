import * as z from "zod";

import type { AppContext } from "#backend/context.ts";
import type { PublicState } from "#backend/serde.ts";

import { SchemaError } from "#backend/error.ts";
import { parseRequestJson } from "#backend/json.ts";

import { makePublicState } from "./state.ts";

export const putCookieRequestBodySchema = z.object({ value: z.string() });

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
