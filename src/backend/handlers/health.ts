import type {
  GetHealthResponseBody,
  HostInfo,
  JSONResponseArgs,
} from "#backend/types.ts";

import { getUpdateReason } from "#backend/check.ts";
import { getHostInfo } from "#backend/external-api/host-info.ts";
import { stateFile } from "#backend/store.ts";

export async function handleGetHealth(): Promise<
  JSONResponseArgs<GetHealthResponseBody>
> {
  let hostInfo: HostInfo;
  try {
    hostInfo = await getHostInfo();
  } catch {
    return {
      body: { ok: false, isOnline: false },
      init: { status: 503 },
    };
  }

  const state = await stateFile.readIfExists();
  const neededUpdateReason = getUpdateReason(state, hostInfo, false);

  if (!neededUpdateReason) {
    return {
      body: { ok: true, isOnline: true },
      init: { status: 200 },
    };
  }

  return {
    body: { ok: false, isOnline: true, neededUpdateReason },
    init: { status: 503 },
  };
}
