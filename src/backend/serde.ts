import { Temporal } from "temporal-polyfill";

import type { SerializedState, State } from "./types";

export function serializeState(state: State): SerializedState {
  return {
    currentCookie: state.currentCookie,
    lastMam: state.lastMam
      ? {
          request: {
            cookie: state.lastMam.request.cookie,
            at: state.lastMam.request.at.toString(),
          },
          response: {
            cookie: state.lastMam.response.cookie,
            httpStatus: state.lastMam.response.httpStatus,
            body: state.lastMam.response.body,
          },
        }
      : undefined,
    lastUpdate: state.lastUpdate
      ? {
          mamUpdated: state.lastUpdate.mamUpdated,
          mamUpdateReason: state.lastUpdate.mamUpdateReason,
          at: state.lastUpdate.at.toString(),
        }
      : undefined,
  };
}

export function deserializeState(ser: SerializedState): State {
  return {
    currentCookie: ser.currentCookie,
    lastMam: ser.lastMam
      ? {
          request: {
            cookie: ser.lastMam.request.cookie,
            at: Temporal.ZonedDateTime.from(ser.lastMam.request.at),
          },
          response: {
            cookie: ser.lastMam.response.cookie,
            httpStatus: ser.lastMam.response.httpStatus,
            body: ser.lastMam.response.body,
          },
        }
      : undefined,
    lastUpdate: ser.lastUpdate
      ? {
          at: Temporal.ZonedDateTime.from(ser.lastUpdate.at),
          mamUpdated: ser.lastUpdate.mamUpdated,
          mamUpdateReason: ser.lastUpdate.mamUpdateReason,
        }
      : undefined,
  };
}
