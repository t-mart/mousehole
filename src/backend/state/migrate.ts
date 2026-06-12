import { SchemaError } from "../error";
import {
  serializedStateSchema,
  STATE_VERSION,
  type SerializedState,
} from "./serde";

function isCurrentVersion(json: unknown): boolean {
  return (
    typeof json === "object" &&
    json !== null &&
    (json as { version?: unknown }).version === STATE_VERSION
  );
}

// Only legacy (pre-/non-current) shapes reach here; the current version is parsed
// strictly. Today the sole legacy location for the credential is `currentCookie`
// (v2 renamed it to `cookie`). When a future version stops being current, append
// its field name to this list.
function findCookie(json: unknown): string | undefined {
  if (typeof json !== "object" || json === null) return undefined;
  const record = json as Record<string, unknown>;
  for (const key of ["currentCookie"]) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

// Bring any persisted state up to the current version, then validate. Migration is
// deliberately lossy: only the cookie survives across versions (lastMam is cheap to
// regenerate on the next check), which keeps future migrations trivial.
export function migrateToCurrent(
  json: unknown,
  sourceName: string,
): SerializedState {
  const candidate = isCurrentVersion(json)
    ? json
    : { version: STATE_VERSION, cookie: findCookie(json) };

  const { data, error } = serializedStateSchema.safeParse(candidate);
  if (error) {
    throw SchemaError.fromExternalSource(sourceName, { cause: error });
  }
  return data;
}
