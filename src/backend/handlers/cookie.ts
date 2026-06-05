import * as z from "zod";

import type { JSONResponseArgs } from "#backend/http.ts";
import type { PublicState } from "#backend/serde.ts";

import { commitContact } from "#backend/contact.ts";
import { SchemaError } from "#backend/error.ts";
import { parseRequestJson } from "#backend/json.ts";

import { makePublicState } from "./state.ts";

export const putCookieRequestBodySchema = z.object({ value: z.string() });

export async function handlePutCookie(
  request: Request,
): Promise<JSONResponseArgs<PublicState>> {
  const json = await parseRequestJson(request);
  const { data, error } = putCookieRequestBodySchema.safeParse(json);
  if (error) throw SchemaError.fromUserSource("request body", { cause: error });

  const state = await commitContact(data.value);
  return { body: makePublicState(state) };
}
