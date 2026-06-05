import type { JSONResponseArgs } from "#backend/http.ts";

import { classify, type ContactStatus } from "#backend/serde.ts";
import { stateFile } from "#backend/store.ts";

export type GetHealthResponseBody = { ok: boolean; reason: ContactStatus };

// A pure read of the last contact: ok when the most recent contact reached MAM and
// the IP update applied (200). No network call, so the Docker healthcheck doesn't
// hammer MAM.
export async function handleGetHealth(): Promise<
  JSONResponseArgs<GetHealthResponseBody>
> {
  const state = await stateFile.readIfExists();
  const reason = classify(state?.lastMamContact);
  const ok = reason === "ok";
  return { body: { ok, reason }, init: { status: ok ? 200 : 503 } };
}
