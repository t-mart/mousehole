// I used to have these types littered around the project, but, because there
// are so many layers of abstraction, I consolidate them here for readability

import type { Temporal } from "temporal-polyfill";

import * as z from "zod/v4";

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

export type IpResponseBody = z.infer<typeof ipResponseBodySchema>;

const updateReasons = [
  "no-last-response",
  "last-response-error",
  "ip-changed",
  "response-stale",
];
export const updateReasonSchema = z.literal(updateReasons).optional();
export type UpdateReason = z.infer<typeof updateReasonSchema>;

const manualUpdateReasons = [...updateReasons, "forced"];
export const manualUpdateReasonSchema = z
  .literal(manualUpdateReasons)
  .optional();
export type ManualUpdateReason = z.infer<typeof manualUpdateReasonSchema>;

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
    hostIp: string;
    mamUpdated: boolean;
    mamUpdateReason?: ManualUpdateReason;
  };
};

export type MamResponse = NonNullable<State["lastMam"]>;

const serializedUpdateSchema = z.object({
  at: z.string(),
  hostIp: z.string(),
  mamUpdated: z.boolean(),
  mamUpdateReason: manualUpdateReasonSchema,
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

export type GetStateResponseBody = {
  /**
   * This is the current host IP (et al) as determined by the ip endpoint. It
   * may be different than the IP of the last update if the host IP has changed.
   */
  host: {
    ip: string;
    asn: number;
    as: string;
  };

  /**
   * Only known at runtime
   */
  nextUpdateAt?: string;
} & SerializedState;

//
// Handler request types (with zod schemas)
//

export const postIpRequestBodySchema = z
  .object({
    force: z.boolean().default(false),
  })
  .optional();
export type PostIpRequestBody = z.infer<typeof postIpRequestBodySchema>;

export const putStateRequestBodySchema = serializedStateSchema.pick({
  currentCookie: true,
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
  updateReason?: UpdateReason;
};

//
// Other
//

export type BackgroundTask = {
  nextUpdateTimeoutId: ReturnType<typeof setTimeout>;
  nextUpdateAt: Temporal.ZonedDateTime;
};
