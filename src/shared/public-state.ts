// The public state contract: what GET /state (and PUT /cookie, POST /checks)
// put on the wire, shared by the backend and the web UI. Deliberately
// dependency-free — the frontend imports `classify` by value, and this module
// must not drag zod or temporal into the web bundle. The backend's disk
// schema (serde.ts) is typed against these shapes, so drift between the
// schema and this contract is a compile error.

/** The outcome of a cookie-driven dynamicSeedbox update. */
export type IpUpdate = {
  success: boolean;
  /** MAM's `msg`, verbatim — for display only, never branch on it. */
  msg: string;
  httpStatus: number;
};

/** A MAM contact as JSON: on disk and on the wire, `at` is RFC 9557. */
export type SerializedMamContact = { at: string } & (
  | { reached: false; error: { type: string; message: string } }
  | {
      reached: true;
      ip: string;
      asn: number;
      as: string;
      /** Present only when a cookie drove a dynamicSeedbox update. */
      ipUpdate?: IpUpdate;
    }
);

/** The public view of state. Never contains the cookie — only its presence. */
export type PublicState = {
  hasCookie: boolean;
  hasAuth: boolean;
  nextCheckAt?: string;
  // identical to the on-disk MamContact — it carries no secret to strip
  lastMamContact?: SerializedMamContact;
};

// ── classification ──────────────────────────────────────────────────────────

export type ContactStatus =
  | "ok" // reached, update applied or already in sync (200)
  | "throttled" // reached, update quashed as too-recent (429)
  | "rejected" // reached, MAM refused the cookie (403)
  | "unreachable" // never got a response
  | "no-cookie" // reached, but only a lookup (no cookie to update with)
  | "pending"; // no contact has happened yet

/**
 * The minimal contact shape `classify` reads — satisfied by both the wire
 * `SerializedMamContact` and the backend's in-memory `MamContact`.
 */
type ClassifiableContact =
  | { reached: false }
  | { reached: true; ipUpdate?: { httpStatus: number } };

// Interpret a contact from status code only (never `msg`).
export function classify(contact?: ClassifiableContact): ContactStatus {
  if (!contact) return "pending";
  if (!contact.reached) return "unreachable";
  if (!contact.ipUpdate) return "no-cookie";
  const { httpStatus } = contact.ipUpdate;
  if (httpStatus === 200) return "ok";
  if (httpStatus === 429) return "throttled";
  return "rejected";
}
