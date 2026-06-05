import { Temporal } from "temporal-polyfill";
import * as z from "zod";

// This module owns the shape of our state: the in-memory domain types, their
// on-disk/wire serialized forms, and the conversions between them. Other modules
// import these rather than re-deriving the shape.
//
// In memory we use `Temporal.ZonedDateTime`; on disk and over the wire we use RFC
// 9557 strings (what `ZonedDateTime.toString()` emits and `from()` round-trips).

export const STATE_VERSION = 2;

// ── in-memory domain types ──────────────────────────────────────────────────

export type MamContact = { at: Temporal.ZonedDateTime } & (
  | { reached: false; error: { type: string; message: string } }
  | {
      reached: true;
      ip: string;
      asn: number;
      as: string;
      // present only when a cookie drove a dynamicSeedbox update
      ipUpdate?: { success: boolean; msg: string; httpStatus: number };
    }
);

export type State = {
  cookie?: string;
  lastMamContact?: MamContact;
};

// ── serialized form (disk + wire): `at` is an RFC 9557 string ───────────────

const ipUpdateSchema = z.object({
  success: z.boolean(),
  // MAM's `msg`, verbatim — for display only, never branch on it
  msg: z.string(),
  httpStatus: z.number(),
});

const serializedMamContactSchema = z.discriminatedUnion("reached", [
  z.object({
    at: z.string(),
    reached: z.literal(false),
    error: z.object({ type: z.string(), message: z.string() }),
  }),
  z.object({
    at: z.string(),
    reached: z.literal(true),
    ip: z.ipv4(),
    asn: z.number(),
    as: z.string(),
    ipUpdate: ipUpdateSchema.optional(),
  }),
]);
export type SerializedMamContact = z.infer<typeof serializedMamContactSchema>;

export const serializedStateSchema = z.object({
  version: z.literal(STATE_VERSION),
  cookie: z.string().optional(),
  lastMamContact: serializedMamContactSchema.optional(),
});
export type SerializedState = z.infer<typeof serializedStateSchema>;

// ── public form (wire): the serialized state minus the credential ───────────

export const publicStateSchema = z.object({
  hasCookie: z.boolean(),
  hasAuth: z.boolean(),
  nextCheckAt: z.string().optional(),
  // identical to the on-disk MamContact — it carries no secret to strip
  lastMamContact: serializedMamContactSchema.optional(),
});
export type PublicState = z.infer<typeof publicStateSchema>;

// ── conversions ─────────────────────────────────────────────────────────────

function serializeMamContact(contact: MamContact): SerializedMamContact {
  if (!contact.reached) {
    return { at: contact.at.toString(), reached: false, error: contact.error };
  }
  return {
    at: contact.at.toString(),
    reached: true,
    ip: contact.ip,
    asn: contact.asn,
    as: contact.as,
    ipUpdate: contact.ipUpdate,
  };
}

function deserializeMamContact(contact: SerializedMamContact): MamContact {
  const at = Temporal.ZonedDateTime.from(contact.at);
  if (!contact.reached) {
    return { at, reached: false, error: contact.error };
  }
  return {
    at,
    reached: true,
    ip: contact.ip,
    asn: contact.asn,
    as: contact.as,
    ipUpdate: contact.ipUpdate,
  };
}

export function serializeState(state: State): SerializedState {
  return {
    version: STATE_VERSION,
    cookie: state.cookie,
    lastMamContact: state.lastMamContact && serializeMamContact(state.lastMamContact),
  };
}

export function deserializeState(serialized: SerializedState): State {
  return {
    cookie: serialized.cookie,
    lastMamContact: serialized.lastMamContact && deserializeMamContact(serialized.lastMamContact),
  };
}

export function toPublicState(
  state: State | undefined,
  derived: { hasAuth: boolean; nextCheckAt?: string },
): PublicState {
  return {
    hasCookie: Boolean(state?.cookie),
    hasAuth: derived.hasAuth,
    nextCheckAt: derived.nextCheckAt,
    lastMamContact: state?.lastMamContact && serializeMamContact(state.lastMamContact),
  };
}

// ── classification ──────────────────────────────────────────────────────────

export type CheckClass = "ok" | "throttled" | "rejected" | "unreachable";

// Interpret a contact from status code only (never `msg`). Returns undefined for
// the setup case (reached, no ipUpdate) and when there is no contact yet — both are
// "not a sync result," surfaced via `hasCookie` upstream.
export function classify(
  contact: MamContact | SerializedMamContact | undefined,
): CheckClass | undefined {
  if (!contact) return undefined;
  if (!contact.reached) return "unreachable";
  if (!contact.ipUpdate) return undefined;
  const { httpStatus } = contact.ipUpdate;
  if (httpStatus === 200) return "ok";
  if (httpStatus === 429) return "throttled";
  return "rejected";
}
