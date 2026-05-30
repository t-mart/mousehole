import type {
  GetHealthResponseBody,
  JSONResponseArgs,
} from "#backend/types.ts";

import { getHostInfo } from "#backend/external-api/host-info.ts";
import { stateFile } from "#backend/store.ts";
import { getUpdateReason } from "#backend/update.ts";

export async function handleGetHealth(): Promise<
  JSONResponseArgs<GetHealthResponseBody>
> {
  const state = await stateFile.readIfExists();
  const hostInfo = await getHostInfo();

  const neededUpdateReason = getUpdateReason(state, hostInfo, false);
  const ok = neededUpdateReason === undefined;

  if (ok) {
    return {
      body: { ok: true },
      init: { status: 200 },
    };
  }

  return {
    body: {
      ok,
      neededUpdateReason,
    },
    init: {
      status: 503,
    },
  };
}
