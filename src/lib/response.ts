import type { Datetime } from "./datetime";
import type { MamApiResponseWithMetadata } from "./mam";

export type MouseholeResponse = {
  success: boolean;
  message: string;
};

export type PostIpResponse = MouseholeResponse & {
  responseWithMetadata: MamApiResponseWithMetadata;
};

export type GetStatusResponse = PostIpResponse & {
  nextAutoUpdate: Datetime | undefined;
};

export type PutCookieResponse = MouseholeResponse;
export type GetCookieResponse = MouseholeResponse & {
  cookieValue: string;
};
