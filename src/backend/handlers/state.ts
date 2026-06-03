import { getNextCheckAt } from "#backend/check.ts";
import { config } from "#backend/config.ts";
import { getIsOnline } from "#backend/connectivity.ts";
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
import { notifyWebSocketClients } from "#backend/websocket.ts";

export function makeStateResponseBody({
  hostInfo,
  nextCheckAt,
  state,
}: {
  hostInfo: HostInfo;
  nextCheckAt?: { toString: () => string };
  state?: State;
}): GetStateResponseBody {
  return {
    host: hostInfo,
    nextCheckAt: nextCheckAt?.toString(),
    hasAuth: config.auth.type === "configured",
    isOnline: getIsOnline(),
    ...serializePublicState(state),
  };
}

export async function handleGetState(): Promise<
  JSONResponseArgs<GetStateResponseBody>
> {
  const hostInfo = await getHostInfo();
  const state = await stateFile.readIfExists();
  const nextCheckAt = getNextCheckAt();

  return {
    body: makeStateResponseBody({ hostInfo, nextCheckAt, state }),
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
    nextCheckAt: getNextCheckAt(),
    state,
  });

  notifyWebSocketClients(body);

  return {
    body,
  };
}
