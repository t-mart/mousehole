import type { GetOkResponseBody, JSONResponseArgs } from "#backend/types.ts";

import { getHostInfo } from "#backend/external-api/host-info.ts";
import { stateFile } from "#backend/store.ts";
import { getUpdateReason } from "#backend/update.ts";

export async function handleGetOk(): Promise<
  JSONResponseArgs<GetOkResponseBody>
> {
  const state = await stateFile.readIfExists();
  const hostInfo = await getHostInfo();

  const updateReason = getUpdateReason(state, hostInfo);
  const ok = updateReason === undefined;

  return {
    body: {
      ok,
      reason: ok ? "no-update-needed" : updateReason,
    },
    init: {
      status: ok ? 200 : 503,
    },
  };
}
