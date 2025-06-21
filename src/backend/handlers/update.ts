import { SchemaError } from "#backend/error.ts";
import { parseRequestJson } from "#backend/json.ts";
import { serializeState } from "#backend/serde.ts";
import {
  postIpRequestBodySchema,
  type ErrorResponseBody,
  type JSONResponseArgs,
  type SerializedUpdate,
} from "#backend/types.ts";
import { updateAndReschedule } from "#backend/update.ts";

export async function handlePostUpdate(
  request: Request
): Promise<JSONResponseArgs<SerializedUpdate | ErrorResponseBody>> {
  const json = await parseRequestJson(request);
  const { data: updateOptions, error } = postIpRequestBodySchema.safeParse(json);

  if (error) {
    throw SchemaError.fromUserSource("request body", { cause: error });
  }

  const state = await updateAndReschedule(updateOptions);

  if (state instanceof Error) {
    throw state;
  }

  const serializedState = serializeState(state);
  const update = serializedState.lastUpdate!;

  return {
    body: update,
  };
}
