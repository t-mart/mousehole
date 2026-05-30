import { config } from "#backend/config.ts";
import { SchemaError } from "#backend/error.ts";
import { getHostInfo } from "#backend/external-api/host-info.ts";
import { parseRequestJson } from "#backend/json.ts";
import { serializePublicState } from "#backend/serde.ts";
import { stateFile } from "#backend/store.ts";
import {
  putStateRequestBodySchema,
  type ErrorResponseBody,
  type GetStateResponseBody,
  type HostInfo,
  type JSONResponseArgs,
  type PutStateResponseBody,
  type State,
} from "#backend/types.ts";
import { getNextUpdateAt } from "#backend/update.ts";
import { notifyWebSocketClients } from "#backend/websocket.ts";

export function makeStateResponseBody({
  hostInfo,
  nextUpdateAt,
  state,
}: {
  hostInfo: HostInfo;
  nextUpdateAt?: { toString: () => string };
  state?: State;
}): GetStateResponseBody {
  return {
    host: hostInfo,
    nextUpdateAt: nextUpdateAt?.toString(),
    hasAuth: config.auth.type === "configured",
    ...serializePublicState(state),
  };
}

export async function handleGetState(): Promise<
  JSONResponseArgs<GetStateResponseBody>
> {
  const hostInfo = await getHostInfo();
  const state = await stateFile.readIfExists();
  const nextUpdateAt = getNextUpdateAt();

  return {
    body: makeStateResponseBody({ hostInfo, nextUpdateAt, state }),
  };
}

export async function handlePutState(
  request: Request,
): Promise<JSONResponseArgs<PutStateResponseBody | ErrorResponseBody>> {
  const json = await parseRequestJson(request);
  const { data: newState, error } = putStateRequestBodySchema.safeParse(json);

  if (error) {
    throw SchemaError.fromUserSource("request body", { cause: error });
  }

  const state = { ...(await stateFile.readIfExists()), ...newState };
  await stateFile.write(state);

  const hostInfo = await getHostInfo();
  const body = makeStateResponseBody({
    hostInfo,
    nextUpdateAt: getNextUpdateAt(),
    state,
  });

  notifyWebSocketClients(body);

  return {
    body,
  };
}
