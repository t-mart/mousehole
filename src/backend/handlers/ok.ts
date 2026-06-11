import { classify, type ContactStatus } from "#backend/serde.ts";
import { stateFile } from "#backend/store.ts";

export type GetOkResponseBody = { ok: boolean; reason: ContactStatus };

// A pure read of the last contact: ok when the most recent contact reached MAM and
// the IP update applied (200). No network call. The route maps `ok` onto the HTTP
// status (200/503).
export async function handleGetOk(): Promise<GetOkResponseBody> {
  const state = await stateFile.readIfExists();
  const reason = classify(state?.lastMamContact);
  return { ok: reason === "ok", reason };
}
