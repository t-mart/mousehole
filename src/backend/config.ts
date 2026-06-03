import type { RequireAtLeastOne } from "type-fest";

import { existsSync } from "node:fs";
import path from "node:path";
import * as z from "zod";

import type { LogLevelName } from "#backend/logger.ts";

import { DEFAULT_LOG_LEVEL, LOG_LEVEL_NAMES, setLogLevel } from "#backend/logger.ts";

import { version } from "../../package.json";

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

// TODO: Remove this migration compatibility code in a future major release, after giving
// users sufficient time to migrate.
const LEGACY_STATE_DIR = "/srv/mousehole";
const DEFAULT_STATE_DIR = "/var/lib/mousehole";

const DEFAULT_ALLOWED_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

const logLevelSchema = z.enum(LOG_LEVEL_NAMES);
const positiveNumberSchema = z.coerce.number().positive();
const positiveIntSchema = z.coerce.number().int().positive();
const portSchema = z.coerce.number().int().min(1).max(65_535);
const boolFlagSchema = z
  .enum(["true", "false"])
  .transform((v) => v === "true");

function getEnv(env: NodeJS.ProcessEnv, name: string): string | undefined {
  return env[name]?.trim() || undefined;
}

function parseEnvVar<T>(name: string, schema: z.ZodType<T>, raw: string): T {
  const result = schema.safeParse(raw);
  if (!result.success) {
    const message = result.error.issues[0]?.message ?? "invalid value";
    throw new Error(
      `Invalid environment variable ${name}="${raw}": ${message}`,
    );
  }
  return result.data;
}

function parseCommaSeparated(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function resolveStateDirectoryPath(env: NodeJS.ProcessEnv): {
  stateDirPath: string;
  stateDirPathDeprecationWarning: string | undefined;
} {
  const environmentValue = getEnv(env, "MOUSEHOLE_STATE_DIR_PATH");
  if (environmentValue !== undefined) {
    return {
      stateDirPath: environmentValue,
      stateDirPathDeprecationWarning: undefined,
    };
  }

  const legacyExists = existsSync(path.join(LEGACY_STATE_DIR, "state.json"));
  const newExists = existsSync(path.join(DEFAULT_STATE_DIR, "state.json"));

  if (legacyExists && !newExists) {
    return {
      stateDirPath: LEGACY_STATE_DIR,
      stateDirPathDeprecationWarning:
        `[DEPRECATION] State found at legacy path ${LEGACY_STATE_DIR}. ` +
        `Migrate to ${DEFAULT_STATE_DIR}. See https://github.com/t-mart/mousehole/issues/51 for migration steps.`,
    };
  }

  return {
    stateDirPath: DEFAULT_STATE_DIR,
    stateDirPathDeprecationWarning: undefined,
  };
}

function resolveLogLevel(env: NodeJS.ProcessEnv): LogLevelName {
  const raw = getEnv(env, "MOUSEHOLE_LOG_LEVEL")?.toLowerCase();
  if (raw === undefined) return DEFAULT_LOG_LEVEL;
  return parseEnvVar("MOUSEHOLE_LOG_LEVEL", logLevelSchema, raw);
}

function resolveNumber(
  env: NodeJS.ProcessEnv,
  name: string,
  schema: z.ZodType<number>,
  defaultValue: number,
): number {
  const raw = getEnv(env, name);
  if (raw === undefined) return defaultValue;
  return parseEnvVar(name, schema, raw);
}

function resolveFlag(env: NodeJS.ProcessEnv, name: string): boolean {
  const raw = getEnv(env, name);
  if (raw === undefined) return false;
  return parseEnvVar(name, boolFlagSchema, raw);
}

function resolveAuthConfig(env: NodeJS.ProcessEnv): AuthConfig {
  const password = getEnv(env, "MOUSEHOLE_AUTH_PASSWORD");
  const token = getEnv(env, "MOUSEHOLE_AUTH_TOKEN");
  const insecureAllowNoAuth = resolveFlag(env, "MOUSEHOLE_INSECURE_ALLOW_NO_AUTH");

  if (password !== undefined) {
    return { type: "configured", password, token };
  }
  if (token !== undefined) {
    return { type: "configured", token };
  }
  return { type: "none", insecureAllowNoAuth };
}

function resolveAllowedHosts(env: NodeJS.ProcessEnv): AllowedHostsConfig {
  const value = getEnv(env, "MOUSEHOLE_ALLOWED_HOSTS");
  if (value === undefined) return { type: "allowlist", hosts: DEFAULT_ALLOWED_HOSTS };
  if (value === "*") return { type: "all" };
  const hosts = parseCommaSeparated(value);
  if (hosts.length === 0) {
    throw new Error(
      "Invalid environment variable MOUSEHOLE_ALLOWED_HOSTS: must not be empty; use * to allow all hosts",
    );
  }
  return { type: "allowlist", hosts };
}

function resolveAllowedOriginsConfig(env: NodeJS.ProcessEnv): AllowedOriginsConfig {
  const value = getEnv(env, "MOUSEHOLE_ALLOWED_ORIGINS");
  if (value === undefined) return { type: "same-origin" };
  if (value === "*") return { type: "all" };
  const origins = parseCommaSeparated(value);
  if (origins.length === 0) {
    throw new Error(
      "Invalid environment variable MOUSEHOLE_ALLOWED_ORIGINS: must not be empty; use * to allow all origins",
    );
  }
  return { type: "allowlist", origins };
}

export function buildConfig(env: NodeJS.ProcessEnv) {
  const { stateDirPath, stateDirPathDeprecationWarning } =
    resolveStateDirectoryPath(env);

  return {
    /**
     * The log level threshold, by name. Messages below this level are suppressed.
     *
     * Controlled by MOUSEHOLE_LOG_LEVEL. Valid values: error, warn, info (default), debug.
     */
    logLevel: resolveLogLevel(env),

    /**
     * The user agent string to use for HTTP requests.
     *
     * Defaults to "mousehole-by-timtimtim/<version>".
     */
    userAgent:
      getEnv(env, "MOUSEHOLE_USER_AGENT") ?? `mousehole-by-timtimtim/${version}`,

    /**
     * The directory path where Mousehole stores its state.
     *
     * Defaults to "/var/lib/mousehole", falling back to "/srv/mousehole" if
     * state already exists there and no env var is set (migration compatibility).
     */
    stateDirPath,

    /** Set when the legacy state directory is in use. */
    stateDirPathDeprecationWarning,

    /**
     * The number of seconds between checks of the host's IP.
     *
     * Defaults to 300 seconds (5 minutes).
     */
    checkIntervalSeconds: resolveNumber(
      env,
      "MOUSEHOLE_CHECK_INTERVAL_SECONDS",
      positiveNumberSchema,
      60 * 5,
    ),

    /**
     * The number of seconds after which to consider a response stale.
     *
     * Defaults to 86400 seconds (1 day).
     */
    staleResponseSeconds: resolveNumber(
      env,
      "MOUSEHOLE_STALE_RESPONSE_SECONDS",
      positiveNumberSchema,
      60 * 60 * 24,
    ),

    /**
     * The number of seconds to wait for a response from MAM before aborting the
     * request. Keeps Mousehole from hanging (e.g. when the VPN isn't up yet and
     * the connection silently stalls).
     *
     * Defaults to 10 seconds.
     */
    mamRequestTimeoutSeconds: resolveNumber(
      env,
      "MOUSEHOLE_MAM_REQUEST_TIMEOUT_SECONDS",
      positiveNumberSchema,
      10,
    ),

    /**
     * The number of seconds after which a browser session expires.
     *
     * Defaults to 604800 seconds (1 week).
     */
    sessionDurationSeconds: resolveNumber(
      env,
      "MOUSEHOLE_SESSION_DURATION_SECONDS",
      positiveIntSchema,
      60 * 60 * 24 * 7,
    ),

    /**
     * The port on which the Mousehole server will listen.
     *
     * Defaults to 5010.
     */
    port: resolveNumber(env, "MOUSEHOLE_PORT", portSchema, 5010),

    /**
     * Whether to set the "Secure" flag on authentication cookies.
     *
     * Defaults to false.
     */
    httpsOnlyCookies: resolveFlag(env, "MOUSEHOLE_HTTPS_ONLY_COOKIES"),

    /**
     * Authentication configuration, derived from environment variables.
     */
    auth: resolveAuthConfig(env),

    /**
     * Allowlist of Host header values that Mousehole will accept.
     *
     * Defaults to ["localhost", "127.0.0.1", "[::1]"].
     */
    allowedHosts: resolveAllowedHosts(env),

    /**
     * Controls which origins are permitted to make cross-origin requests.
     *
     * Defaults to same-origin only.
     */
    allowedOrigins: resolveAllowedOriginsConfig(env),
  };
}

export const config = buildConfig(process.env);

// Wire the resolved level into the logger once, at app config load. buildConfig
// itself stays pure so it can be unit-tested without mutating logger state.
setLogLevel(config.logLevel);
