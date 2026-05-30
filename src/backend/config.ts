import type { RequireAtLeastOne } from "type-fest";

import { existsSync } from "node:fs";
import path from "node:path";

import { version } from "../../package.json";

function getEnv(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

function getEnvOr(name: string, fallback: string): string;
function getEnvOr<T>(name: string, fallback: T, map: (s: string) => T): T;
function getEnvOr<T>(name: string, fallback: T, map?: (s: string) => T): T {
  const raw = getEnv(name);
  if (raw === undefined) return fallback;
  return map ? map(raw) : (raw as T);
}

function getEnvFlag(name: string): boolean {
  return getEnv(name) === "true";
}

function parseCommaSeparated(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// TODO: Remove this migration compatibility code in a future major release, after giving
// users sufficient time to migrate.
const LEGACY_STATE_DIR = "/srv/mousehole";
const NEW_STATE_DIR = "/var/lib/mousehole";

function resolveStateDirectoryPath(): {
  stateDirPath: string;
  stateDirPathDeprecationWarning: string | undefined;
} {
  const environmentValue = process.env.MOUSEHOLE_STATE_DIR_PATH;

  if (environmentValue !== undefined) {
    return {
      stateDirPath: environmentValue,
      stateDirPathDeprecationWarning: undefined,
    };
  }

  // No env var set — use filesystem to detect migration state.
  const legacyExists = existsSync(path.join(LEGACY_STATE_DIR, "state.json"));
  const newExists = existsSync(path.join(NEW_STATE_DIR, "state.json"));

  if (legacyExists && !newExists) {
    return {
      stateDirPath: LEGACY_STATE_DIR,
      stateDirPathDeprecationWarning:
        `[DEPRECATION] State found at legacy path ${LEGACY_STATE_DIR}. ` +
        `Migrate to ${NEW_STATE_DIR}. See https://github.com/t-mart/mousehole/issues/51 for migration steps.`,
    };
  }

  return {
    stateDirPath: NEW_STATE_DIR,
    stateDirPathDeprecationWarning: undefined,
  };
}

const { stateDirPath, stateDirPathDeprecationWarning } =
  resolveStateDirectoryPath();
export { stateDirPathDeprecationWarning };

export type AuthConfig =
  // exclude "configured" type from having neither of password or token
  | RequireAtLeastOne<
      {
        type: "configured";
        password?: string;
        token?: string;
      },
      "password" | "token"
    >
  | {
      type: "none";
      insecureAllowNoAuth: boolean;
    };

export type AllowedHostsConfig =
  | {
      type: "allowlist";
      hosts: readonly string[];
    }
  | { type: "all" };

export type AllowedOriginsConfig =
  | {
      type: "same-origin";
    }
  | {
      type: "allowlist";
      origins: readonly string[];
    }
  | { type: "all" };

function resolveAuthConfig(): AuthConfig {
  const password = getEnv("MOUSEHOLE_AUTH_PASSWORD");
  const token = getEnv("MOUSEHOLE_AUTH_TOKEN");
  const insecureAllowNoAuth = getEnvFlag("MOUSEHOLE_INSECURE_ALLOW_NO_AUTH");

  if (password !== undefined) {
    // need concrete branch for type checker. this satisfies both password-only
    // and password+token cases
    return { type: "configured", password, token };
  } else if (token !== undefined) {
    // token-only case
    return { type: "configured", token };
  }

  return { type: "none", insecureAllowNoAuth };
}

const DEFAULT_ALLOWED_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

function resolveAllowedHosts(): AllowedHostsConfig {
  const value = getEnv("MOUSEHOLE_ALLOWED_HOSTS");
  if (value === undefined)
    return { type: "allowlist", hosts: DEFAULT_ALLOWED_HOSTS };
  if (value === "*") return { type: "all" };
  return {
    type: "allowlist",
    hosts: parseCommaSeparated(value),
  };
}

function resolveAllowedOriginsConfig(): AllowedOriginsConfig {
  const value = getEnv("MOUSEHOLE_ALLOWED_ORIGINS");
  if (value === undefined) return { type: "same-origin" };
  if (value === "*") return { type: "all" };
  return { type: "allowlist", origins: parseCommaSeparated(value) };
}

export const config = {
  /**
   * The user agent string to use for HTTP requests.
   *
   * Defaults to "mousehole-by-timtimtim".
   */
  userAgent: getEnvOr(
    "MOUSEHOLE_USER_AGENT",
    `mousehole-by-timtimtim/${version}`,
  ),

  /**
   * The directory path where Mousehole stores its state.
   *
   * Defaults to "/var/lib/mousehole", falling back to "/srv/mousehole" if
   * state already exists there and no env var is set (migration compatibility).
   */
  stateDirPath,

  /**
   * The number of seconds between checks of the host's IP. If the IP has
   * changed, a request to MAM will be performed.
   *
   * Defaults to 300 seconds (5 minutes).
   */
  checkIntervalSeconds: getEnvOr(
    "MOUSEHOLE_CHECK_INTERVAL_SECONDS",
    // 5 minutes
    60 * 5,
    (value) => Number.parseFloat(value),
  ),

  /**
   * The number of seconds after which to consider a response stale. After this
   * time, on the next check, a request to MAM will be performed even if the
   * host's IP has not changed.
   *
   * Defaults to 86400 seconds (1 day).
   */
  staleResponseSeconds: getEnvOr(
    "MOUSEHOLE_STALE_RESPONSE_SECONDS",
    60 * 60 * 24, // 1 day
    (value) => Number.parseFloat(value),
  ),

  /**
   * The number of seconds after which a browser session expires.
   *
   * Defaults to 604800 seconds (1 week).
   */
  sessionDurationSeconds: getEnvOr(
    "MOUSEHOLE_SESSION_DURATION_SECONDS",
    60 * 60 * 24 * 7, // 1 week
    (value) => Number.parseInt(value),
  ),

  /**
   * The port on which the Mousehole server will listen.
   *
   * Defaults to 5010.
   */
  port: getEnvOr("MOUSEHOLE_PORT", 5010, (value) => Number.parseInt(value)),

  /**
   * Whether to set the "Secure" flag on authentication cookies, which will cause
   * browsers to only send them over HTTPS connections.
   *
   * Defaults to false, but should be set to true if Mousehole will only be
   * accessed over HTTPS (e.g. a reverse proxy)
   */
  httpsOnlyCookies: getEnvFlag("MOUSEHOLE_HTTPS_ONLY_COOKIES"),

  /**
   * Authentication configuration, derived from environment variables.
   *
   * Set MOUSEHOLE_AUTH_PASSWORD to accept a password on the login page.
   * Set MOUSEHOLE_AUTH_TOKEN to accept a Bearer token on all protected endpoints.
   * Both may be set simultaneously. If neither is set, MOUSEHOLE_INSECURE_ALLOW_NO_AUTH=true
   * must be explicitly provided to run without authentication.
   */
  auth: resolveAuthConfig(),

  /**
   * Allowlist of Host header values that Mousehole will accept. Values may
   * include a port (e.g. "example.com:5010"). Requests whose Host header does
   * not match any entry are rejected with 403.
   *
   * Defaults to ["localhost", "127.0.0.1", "[::1]"] (port-agnostic, matching
   * any port on loopback). Set MOUSEHOLE_ALLOWED_HOSTS to a comma-separated
   * list to override.
   */
  allowedHosts: resolveAllowedHosts(),

  /**
   * Controls which origins are permitted to make cross-origin requests.
   * Requests with an Origin header that does not match are rejected with 403.
   *
   * Defaults to same-origin only. Set MOUSEHOLE_ALLOWED_ORIGINS to a
   * comma-separated list of origins (e.g. "https://example.com") to allow
   * additional origins.
   */
  allowedOrigins: resolveAllowedOriginsConfig(),
};
