import type {
  AllowedOriginsConfig,
  AuthConfig,
  AllowedHostsConfig,
} from "./config.ts";

import { config } from "./config.ts";
import { logger } from "./logger.ts";
import { validateRequestSession } from "./session.ts";

export type SecurityConfig = {
  allowedHosts: AllowedHostsConfig;
  allowedOrigins: AllowedOriginsConfig;
  auth: AuthConfig;
};

type HostAndPort = {
  hostname: string;
  port?: string;
};

type BoundaryFailure = {
  headers?: HeadersInit;
  message: string;
  status: number;
  type: string;
};

export type ProtectedRequestOptions = {
  requireAuth?: boolean;
  requireJsonContentType?: boolean;
  requireOrigin?: boolean;
};

export function validateRuntimeSecurityConfig(
  securityConfig: Pick<SecurityConfig, "auth"> = config,
): void {
  if (
    securityConfig.auth.type === "configured" &&
    !securityConfig.auth.password
  ) {
    logger.warn(
      "MOUSEHOLE_AUTH_PASSWORD is not set. Browser login will be unavailable.",
    );
  }
  if (securityConfig.auth.type !== "none") {
    return;
  }

  if (!securityConfig.auth.insecureAllowNoAuth) {
    throw new Error(
      "Mousehole authentication is not configured. Set MOUSEHOLE_AUTH_PASSWORD and/or MOUSEHOLE_AUTH_TOKEN, or set MOUSEHOLE_INSECURE_ALLOW_NO_AUTH=true to opt out.",
    );
  }

  logger.warn(
    "Running without authentication (MOUSEHOLE_INSECURE_ALLOW_NO_AUTH=true). Do not expose Mousehole to mixed-trust LAN, VPN, or public interfaces.",
  );
}

export function guardProtectedRequest(
  request: Request,
  options: ProtectedRequestOptions = {},
  securityConfig: SecurityConfig = config,
): Response | undefined {
  const failure = checkProtectedRequest(request, options, securityConfig);

  if (!failure) {
    return undefined;
  }

  return makeFailureResponse(failure);
}

export function checkProtectedRequest(
  request: Request,
  options: ProtectedRequestOptions = {},
  securityConfig: SecurityConfig = config,
): BoundaryFailure | undefined {
  // TODO: clean up the logging here later. logging is a middleware job. we also
  // dirty test output putting it here.
  const context = `${request.method} ${new URL(request.url).pathname}`;

  const hostFailure = checkHost(request, securityConfig.allowedHosts);
  if (hostFailure) {
    const host = getRequestHost(request);
    logger.warn(
      `[${context}] host not allowed: ${host ? `"${host}"` : "(missing)"}`,
    );
    return hostFailure;
  }

  if (options.requireAuth !== false) {
    const authFailure = checkAuthentication(request, securityConfig.auth);
    if (authFailure) {
      logger.debug(`[${context}] authentication required`);
      return authFailure;
    }
  }

  if (options.requireOrigin) {
    const originFailure = checkOrigin(request, securityConfig.allowedOrigins);
    if (originFailure) {
      const origin = request.headers.get("origin");
      logger.warn(`[${context}] origin not allowed: "${origin}"`);
      return originFailure;
    }
  }

  if (options.requireJsonContentType) {
    const contentTypeFailure = checkJsonContentType(request);
    if (contentTypeFailure) {
      const contentType = request.headers.get("content-type") ?? "(missing)";
      logger.warn(`[${context}] unsupported content type: "${contentType}"`);
      return contentTypeFailure;
    }
  }
}

function checkHost(
  request: Request,
  allowedHosts: AllowedHostsConfig,
): BoundaryFailure | undefined {
  if (allowedHosts.type === "all") {
    return undefined;
  }

  const host = getRequestHost(request);

  if (!host) {
    return {
      status: 403,
      type: "host-not-allowed",
      message: "Request Host header is required.",
    };
  }

  const requestHost = parseHostAndPort(host);

  if (!requestHost) {
    return {
      status: 403,
      type: "host-not-allowed",
      message: "Request Host header is invalid.",
    };
  }

  const isAllowed = allowedHosts.hosts.some((allowedHost) => {
    const rule = parseHostAndPort(allowedHost);
    return rule ? hostMatchesRule(requestHost, rule) : false;
  });

  if (isAllowed) {
    return undefined;
  }

  return {
    status: 403,
    type: "host-not-allowed",
    message: "Request Host header is not allowed.",
  };
}

function checkAuthentication(
  request: Request,
  authConfig: AuthConfig,
): BoundaryFailure | undefined {
  if (authConfig.type === "none") {
    return authConfig.insecureAllowNoAuth
      ? undefined
      : {
          status: 500,
          type: "auth-not-configured",
          message: "Mousehole authentication is not configured.",
        };
  }

  if (validateRequestSession(request)) {
    return undefined;
  }

  if (authConfig.token) {
    const authorization = request.headers.get("authorization");
    if (checkTokenAuthorization(authorization, authConfig.token)) {
      return undefined;
    }
  }

  return {
    status: 401,
    type: "authentication-required",
    message: "Authentication is required.",
    headers: {
      "WWW-Authenticate": 'Bearer realm="Mousehole"',
    },
  };
}

function checkOrigin(
  request: Request,
  allowedOrigins: AllowedOriginsConfig,
): BoundaryFailure | undefined {
  const origin = request.headers.get("origin");

  if (!origin) {
    return undefined;
  }

  const normalizedOrigin = normalizeOrigin(origin);
  let isAllowed: boolean;
  if (allowedOrigins.type === "all") {
    isAllowed = true;
  } else if (allowedOrigins.type === "same-origin") {
    isAllowed = normalizedOrigin === new URL(request.url).origin;
  } else {
    isAllowed = allowedOrigins.origins
      .map((o) => normalizeOrigin(o))
      .includes(normalizedOrigin);
  }

  if (isAllowed) {
    return undefined;
  }

  return {
    status: 403,
    type: "origin-not-allowed",
    message: `Origin '${origin}' is not allowed.`,
  };
}

function checkJsonContentType(request: Request): BoundaryFailure | undefined {
  const contentType = request.headers.get("content-type");
  const mediaType = contentType?.split(";", 1)[0]?.trim().toLowerCase();

  if (mediaType === "application/json") {
    return undefined;
  }

  return {
    status: 415,
    type: "unsupported-media-type",
    message: "Content-Type must be application/json.",
  };
}

function checkTokenAuthorization(
  authorization: string | null,
  token: string,
): boolean {
  const bearerMatch = /^Bearer\s+(.+)$/i.exec(authorization ?? "");
  return Boolean(bearerMatch?.[1] && safeEqual(bearerMatch[1], token));
}

export function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }

  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |=
      (left.codePointAt(index) ?? 0) ^ (right.codePointAt(index) ?? 0);
  }

  return difference === 0;
}

function getRequestHost(request: Request): string {
  return request.headers.get("host") ?? new URL(request.url).host;
}

function parseHostAndPort(value: string): HostAndPort | undefined {
  try {
    const { hostname, port, pathname, search } = new URL(
      "http://" + value.trim().toLowerCase(),
    );
    if (!hostname || pathname !== "/" || search !== "") return undefined;
    return { hostname, port: port || undefined };
  } catch {
    return undefined;
  }
}

function hostMatchesRule(requestHost: HostAndPort, rule: HostAndPort): boolean {
  return (
    requestHost.hostname === rule.hostname &&
    (rule.port === undefined || requestHost.port === rule.port)
  );
}

function normalizeOrigin(origin: string): string {
  try {
    return new URL(origin).origin;
  } catch {
    return origin;
  }
}

function makeFailureResponse(failure: BoundaryFailure): Response {
  return Response.json(
    { type: failure.type, message: failure.message },
    { status: failure.status, headers: failure.headers },
  );
}
