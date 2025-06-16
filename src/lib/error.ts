import { cookieEndpointPath, ipEndpointPath } from "src";

export class MouseholeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MouseholeError";
  }
}

export class NoCookieError extends MouseholeError {
  constructor() {
    super(
      `No cookie value found. Please initialize the cookie with the ${cookieEndpointPath} endpoint.`
    );
    this.name = "NoCookieError";
  }
}

export class NoLatestUpdateError extends MouseholeError {
  constructor() {
    super(
      `No latest update found. Please run an update first with the ${ipEndpointPath} endpoint.`
    );
    this.name = "NoLatestUpdateError";
  }
}
