import { SchemaError } from "#backend/error.ts";
import { getHostIpInfo } from "#backend/external-api/host-ip.ts";
import { parseRequestJson } from "#backend/json.ts";
import { serializeState } from "#backend/serde.ts";
import { stateFile } from "#backend/store.ts";
import {
  putStateRequestBodySchema,
  type ErrorResponseBody,
  type GetStateResponseBody,
  type JSONResponseArgs,
  type PutStateResponseBody,
} from "#backend/types.ts";
import { getNextUpdateAt } from "#backend/update.ts";
import { notifyWebSocketClients } from "#index.tsx";

export async function handleGetState(): Promise<
  JSONResponseArgs<GetStateResponseBody>
> {
  const host = await getHostIpInfo();
  const state = await stateFile.readIfExists();
  const nextUpdateAt = getNextUpdateAt();

  return {
    body: {
      host,
      nextUpdateAt: nextUpdateAt?.toString(),
      ...(state ? serializeState(state) : {}),
    },
  };
}

export async function handlePutState(
  request: Request
): Promise<JSONResponseArgs<PutStateResponseBody | ErrorResponseBody>> {
  const json = await parseRequestJson(request);
  const { data: newState, error } = putStateRequestBodySchema.safeParse(json);

  if (error) {
    throw SchemaError.fromUserSource("request body", { cause: error });
  }

  const state = { ...stateFile.readIfExists(), ...newState };
  await stateFile.write(state);

  // notify websocket clients
  notifyWebSocketClients();

  return handleGetState();
}
