import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import { createMiddleware } from "hono/factory";

import type {
  AllowedOriginsConfig,
  AuthConfig,
  AllowedHostsConfig,
} from "./config.ts";

import { extractSessionId } from "./session.ts";

type HostAndPort = {
  hostname: string;
  port?: string;
};

// A failure's `message` is client-facing and deliberately actionable (it
// names offending values and the env var to set). The boundary does not log
// rejections — the client surfaces them, and duplicating them into the
// server log was decided to be noise.
export type BoundaryFailure = {
  headers?: Record<string, string>;
  message: string;
  status: ContentfulStatusCode;
  type: string;
};

/**
 * The stateful capabilities the boundary checks need. Kept as an explicit
 * dependency so the checks themselves stay pure functions of their inputs.
 */
export type SessionAuthValidator = (request: Request) => boolean;

/**
 * How a request cleared `requireAuth`, published on the Hono context so
 * downstream boundary checks can adapt (`originAllowed` skips for "token").
 */
export type AuthMethod = "none" | "session" | "token";

type BoundaryEnv = { Variables: { authMethod?: AuthMethod } };

type BoundaryCheck = (request: Request) => BoundaryFailure | undefined;

/** Turn a failure into the client-facing JSON response. */
function respondWithFailure(c: Context, failure: BoundaryFailure): Response {
  return c.json(
    { type: failure.type, message: failure.message },
    failure.status,
    failure.headers,
  );
}

/**
 * Wrap a pure check into route middleware: a failure responds without
 * reaching the handler. Routes list these middlewares varargs-style, so
 * failure precedence is their textual order at the route.
 */
function createBoundaryMiddleware(check: BoundaryCheck) {
  return createMiddleware(async (c, next) => {
    const failure = check(c.req.raw);
    if (failure) return respondWithFailure(c, failure);
    await next();
  });
}

/** Rejects requests whose Host header isn't allowlisted (DNS-rebinding defense). */
export function hostAllowed(allowedHosts: AllowedHostsConfig) {
  return createBoundaryMiddleware((request) =>
    checkHost(request, allowedHosts),
  );
}

/** Rejects requests carrying neither a valid session nor a valid Bearer token. */
export function requireAuth(
  authConfig: AuthConfig,
  isSessionValid: SessionAuthValidator,
) {
  return createMiddleware<BoundaryEnv>(async (c, next) => {
    const result = checkAuthentication(c.req.raw, authConfig, isSessionValid);
    if ("failure" in result) return respondWithFailure(c, result.failure);
    c.set("authMethod", result.method);
    await next();
  });
}

/** Rejects disallowed cross-origin requests (CSRF defense); origin-less requests pass. */
export function originAllowed(allowedOrigins: AllowedOriginsConfig) {
  return createMiddleware<BoundaryEnv>(async (c, next) => {
    // The origin check is a CSRF defense, and CSRF needs an ambient credential
    // (the browser auto-attaching the session cookie). A Bearer token is
    // explicit — a cross-site page cannot attach it (forms can't set headers;
    // fetch setting one triggers a CORS preflight we never approve) — so a
    // token-authenticated request carries no CSRF risk to block. Sessions,
    // the no-auth opt-out, and stacks without `requireAuth` (login) stay
    // enforced. Requires `requireAuth` to run earlier in the route's stack.
    if (c.get("authMethod") !== "token") {
      const failure = checkOrigin(c.req.raw, allowedOrigins);
      if (failure) return respondWithFailure(c, failure);
    }
    await next();
  });
}

/** Rejects request bodies not declared as application/json. */
export const requireJsonBody = createBoundaryMiddleware(checkJsonContentType);

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
      message: "Request Host header is required."
    };
  }

  const requestHost = parseHostAndPort(host);

  if (!requestHost) {
    return {
      status: 403,
      type: "host-not-allowed",
      message: `Request Host "${host}" is invalid.`
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
    message: `Host "${host}" not allowed. (Set MOUSEHOLE_ALLOWED_HOSTS to permit it)`,
  };
}

type AuthCheckResult = { failure: BoundaryFailure } | { method: AuthMethod };

// The ladder is ordered session → token → opt-out, so a reported "token"
// means the ambient session cookie played no part in authorizing the request
// (which is what lets originAllowed waive the CSRF check).
function checkAuthentication(
  request: Request,
  authConfig: AuthConfig,
  isSessionValid: SessionAuthValidator,
): AuthCheckResult {
  if (authConfig.type === "none") {
    return authConfig.insecureAllowNoAuth
      ? { method: "none" }
      : {
          failure: {
            status: 500,
            type: "auth-not-configured",
            message:
              "Mousehole authentication is not configured. Set MOUSEHOLE_AUTH_PASSWORD or MOUSEHOLE_AUTH_TOKEN to enable.",
          },
        };
  }

  if (isSessionValid(request)) {
    return { method: "session" };
  }

  const authorization = request.headers.get("authorization");
  if (
    authConfig.token &&
    checkTokenAuthorization(authorization, authConfig.token)
  ) {
    return { method: "token" };
  }

  // A presented-but-rejected Bearer token is a misconfigured (or hostile) API
  // client and worth surfacing at the default log level; everything else is
  // routine browser traffic (no credentials yet, or an expired session).
  const presentedBearer = authorization !== null;
  const presentedSession = extractSessionId(request) !== undefined;
  return {
    failure: {
      status: 401,
      type: "authentication-required",
      message: presentedBearer
        ? "Rejected Bearer token (wrong value, or MOUSEHOLE_AUTH_TOKEN not set)"
        : presentedSession
          ? "Unknown or expired session cookie"
          : "No credentials presented",
      headers: {
        "WWW-Authenticate": 'Bearer realm="Mousehole"',
      },
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
    message: `Origin "${origin}" is not allowed.`,
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
    message: `Unsupported content type "${contentType ?? ""}", must be "application/json"`,
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
