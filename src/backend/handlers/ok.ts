import type { GetOkResponseBody, JSONResponseArgs } from "#backend/types.ts";

import { getHostIpInfo } from "#backend/external-api/host-ip.ts";
import { stateFile } from "#backend/store.ts";
import { getUpdateReason } from "#backend/update.ts";

export async function handleGetOk(): Promise<
  JSONResponseArgs<GetOkResponseBody>
> {
  const state = await stateFile.readIfExists();
  const { ip: hostIp } = await getHostIpInfo();

  const updateReason = getUpdateReason(state, hostIp);
  const ok = updateReason === undefined;

  return {
    body: {
      ok,
      updateReason,
    },
    init: {
      status: ok ? 200 : 400,
    },
  };
}
