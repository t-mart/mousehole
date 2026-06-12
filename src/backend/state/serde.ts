import { Temporal } from "temporal-polyfill";
import * as z from "zod";

import type {
  PublicState,
  SerializedMamContact,
} from "#shared/public-state.ts";

// This module owns the persistence of our state: the in-memory domain types,
// their on-disk serialized forms, and the conversions between them. The wire
// contract those forms must match (PublicState, SerializedMamContact) lives in
// #shared/public-state.ts, shared with the web UI.
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

// ── serialized form (disk): `at` is an RFC 9557 string ──────────────────────

const ipUpdateSchema = z.object({
  success: z.boolean(),
  // MAM's `msg`, verbatim — for display only, never branch on it
  msg: z.string(),
  httpStatus: z.number(),
});

// Typed against the shared wire contract so schema/contract drift is a
// compile error. The disk schema guards *structure* only; semantic validation
// (e.g. the ip being IPv4) happens at ingestion (external-api schemas). Keep
// it that way: a stricter read schema than the write path can make states we
// already persisted unreadable.
const serializedMamContactSchema: z.ZodType<SerializedMamContact> =
  z.discriminatedUnion("reached", [
    z.object({
      at: z.string(),
      reached: z.literal(false),
      error: z.object({ type: z.string(), message: z.string() }),
    }),
    z.object({
      at: z.string(),
      reached: z.literal(true),
      ip: z.string(),
      asn: z.number(),
      as: z.string(),
      ipUpdate: ipUpdateSchema.optional(),
    }),
  ]);

export const serializedStateSchema = z.object({
  version: z.literal(STATE_VERSION),
  cookie: z.string().optional(),
  lastMamContact: serializedMamContactSchema.optional(),
});
export type SerializedState = z.infer<typeof serializedStateSchema>;

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
