import type { Datetime } from "./datetime";
import type { MamApiResponseWithMetadata } from "./mam";

export type MouseholeResponse = {
  success: boolean;
  message: string;
};

export type UpdateIpResponse = MouseholeResponse & {
  responseWithMetadata: MamApiResponseWithMetadata;
};

export type StatusResponse = UpdateIpResponse & {
  nextAutoUpdate: Datetime | undefined;
};

export type SetCookieResponse = MouseholeResponse;
