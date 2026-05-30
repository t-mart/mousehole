// I used to have these types littered around the project, but, because there
// are so many layers of abstraction, I consolidate them here for readability

import type { Temporal } from "temporal-polyfill";

import * as z from "zod";

//
// External API types
//

export const mamUpdateDynamicSeedboxResponseBodySchema = z.object({
  Success: z.boolean(),
  msg: z.string(),
  ip: z.ipv4(),
  ASN: z.number(),
  AS: z.string(),
});
export type MamUpdateDynamicSeedboxResponseBody = z.infer<
  typeof mamUpdateDynamicSeedboxResponseBodySchema
>;

export const ipResponseBodySchema = z.object({
  ip: z.ipv4(),
  ASN: z.number(),
  AS: z.string(),
});

//
// State types
//

export const hostInfoSchema = z.object({
  ip: z.ipv4(),
  asn: z.number(),
  as: z.string(),
});
export type HostInfo = z.infer<typeof hostInfoSchema>;

export type IpResponseBody = z.infer<typeof ipResponseBodySchema>;

const updateReasons = [
  "no-last-response",
  "last-response-error",
  "ip-changed",
  "asn-changed",
  "cookie-changed",
  "response-stale",
  "force-update",
];
export const updateReasonSchema = z.literal(updateReasons);
export type UpdateReason = z.infer<typeof updateReasonSchema>;

const okResponseUpdateReasons = [...updateReasons, "no-update-needed"];
export const okResponseUpdateReasonSchema = z.literal(okResponseUpdateReasons);
export type OkResponseUpdateReason = z.infer<
  typeof okResponseUpdateReasonSchema
>;

export type State = {
  currentCookie?: string;
  lastMam?: {
    request: {
      cookie: string;
      at: Temporal.ZonedDateTime;
    };
    response: {
      cookie?: string;
      httpStatus: number;
      body: MamUpdateDynamicSeedboxResponseBody;
    };
  };
  lastUpdate?: {
    at: Temporal.ZonedDateTime;
    mamUpdated: boolean;
    mamUpdateReason?: UpdateReason;
  };
};

export type MamResponse = NonNullable<State["lastMam"]>;

const serializedUpdateSchema = z.object({
  at: z.string(),
  mamUpdated: z.boolean(),
  mamUpdateReason: updateReasonSchema.optional(),
});

export const serializedStateSchema = z.object({
  currentCookie: z.string().optional(),
  lastMam: z
    .object({
      request: z.object({
        cookie: z.string(),
        at: z.string(),
      }),
      response: z.object({
        cookie: z.string().optional(),
        httpStatus: z.number(),
        body: mamUpdateDynamicSeedboxResponseBodySchema,
      }),
    })
    .optional(),
  lastUpdate: serializedUpdateSchema.optional(),
});

export type SerializedState = z.infer<typeof serializedStateSchema>;
export type SerializedUpdate = z.infer<typeof serializedUpdateSchema>;

export const publicSerializedStateSchema = z.object({
  hasCurrentCookie: z.boolean(),
  lastMam: z
    .object({
      request: z.object({
        at: z.string(),
      }),
      response: z.object({
        httpStatus: z.number(),
        body: mamUpdateDynamicSeedboxResponseBodySchema,
      }),
    })
    .optional(),
  lastUpdate: serializedUpdateSchema.optional(),
});

export type PublicSerializedState = z.infer<
  typeof publicSerializedStateSchema
>;

export const getStateResponseBodySchema = publicSerializedStateSchema.extend({
  host: hostInfoSchema,
  nextUpdateAt: z.string().optional(),
  hasAuth: z.boolean(),
});
export type GetStateResponseBody = z.infer<typeof getStateResponseBodySchema>;

export const wsClientMessageSchema = z.object({
  type: z.literal("ping"),
});
export type WsClientMessage = z.infer<typeof wsClientMessageSchema>;

const wsStateUpdateMessageSchema = z.object({
  type: z.literal("state-update"),
  data: getStateResponseBodySchema,
});

export const wsServerMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("pong") }),
  wsStateUpdateMessageSchema,
  z.object({ type: z.literal("session-expired") }),
]);
export type WsServerMessage = z.infer<typeof wsServerMessageSchema>;

//
// Handler request types (with zod schemas)
//

export const postIpRequestBodySchema = z
  .object({
    force: z.boolean().default(false),
  })
  .optional();
export type PostIpRequestBody = z.infer<typeof postIpRequestBodySchema>;

export const putStateRequestBodySchema = z.object({
  currentCookie: z.string(),
});
export type PutStateRequestBody = z.infer<typeof putStateRequestBodySchema>;

//
// Handler Response types
//

export type JSONResponseArgs<T> = {
  body: T;
  init?: ResponseInit;
};

export type ErrorResponseBody = {
  type: string;
  message: string;
  [key: string]: unknown; // For additional error details, like zod issues or other supplemental data
};

export type PutStateResponseBody = GetStateResponseBody;

export type DeleteStateResponseBody = {
  message: string;
};

export type GetOkResponseBody = {
  ok: boolean;
  reason: OkResponseUpdateReason;
};

//
// Other
//

export type BackgroundTask = {
  nextUpdateTimeoutId: ReturnType<typeof setTimeout>;
  nextUpdateAt: Temporal.ZonedDateTime;
};
