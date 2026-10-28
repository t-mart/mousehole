import { readFileSync } from "node:fs";

import type { RequireAtLeastOne } from "type-fest";
import * as z from "zod";

import { normalizeBasePath } from "#backend/base-path.ts";
import type { LogLevelName } from "#backend/logger.ts";
import { DEFAULT_LOG_LEVEL, LOG_LEVEL_NAMES } from "#backend/logger.ts";

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

const DEFAULT_STATE_DIR = "/var/lib/mousehole";

const DEFAULT_ALLOWED_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

const logLevelSchema = z.enum(LOG_LEVEL_NAMES);
const positiveNumberSchema = z.coerce.number().positive();
const positiveIntSchema = z.coerce.number().int().positive();
const portSchema = z.coerce.number().int().min(1).max(65_535);
const boolFlagSchema = z.enum(["true", "false"]).transform((v) => v === "true");
// Normalises as it validates, so the resolved config is already canonical (no
// trailing slash, leading slash present) and every consumer can concatenate.
const basePathSchema = z.string().transform((value, ctx) => {
  const normalized = normalizeBasePath(value);
  if (normalized === undefined) {
    ctx.addIssue({
      code: "custom",
      message:
        'must be a URL path prefix such as "/mousehole" (no scheme, host, query, fragment, "//", dot segments, whitespace, or backslashes)',
    });
    return z.NEVER;
  }
  return normalized;
});

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

// The default reader for `*_FILE` secret resolution, injectable so config tests
// stay hermetic (no disk)
const defaultReadTextFileSync = (filePath: string): string =>
  readFileSync(filePath, "utf8");

/**
 * Resolve a secret credential. A `${name}_FILE` variable points at a file whose
 * trimmed contents are the value. Takes precedence over the plain `${name}`. A
 * file that can't be read fails fast; a file whose trimmed contents are empty
 * resolves to `undefined`, exactly as an empty or unset env var does.
 */
function resolveSecret(
  env: NodeJS.ProcessEnv,
  name: string,
  readTextFileSync: (filePath: string) => string,
): string | undefined {
  const filePath = getEnv(env, `${name}_FILE`);
  if (filePath === undefined) return getEnv(env, name);

  let contents: string;
  try {
    contents = readTextFileSync(filePath);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Invalid environment variable ${name}_FILE="${filePath}": could not read file (${reason})`,
    );
  }
  return contents.trim() || undefined;
}

function resolveAuthConfig(
  env: NodeJS.ProcessEnv,
  readTextFileSync: (filePath: string) => string,
): AuthConfig {
  const password = resolveSecret(
    env,
    "MOUSEHOLE_AUTH_PASSWORD",
    readTextFileSync,
  );
  const token = resolveSecret(env, "MOUSEHOLE_AUTH_TOKEN", readTextFileSync);
  const insecureAllowNoAuth = resolveFlag(
    env,
    "MOUSEHOLE_INSECURE_ALLOW_NO_AUTH",
  );

  if (insecureAllowNoAuth && (password !== undefined || token !== undefined)) {
    const credential =
      password === undefined
        ? "MOUSEHOLE_AUTH_TOKEN"
        : "MOUSEHOLE_AUTH_PASSWORD";
    throw new Error(
      `MOUSEHOLE_INSECURE_ALLOW_NO_AUTH=true cannot be combined with ${credential}: turning off authentication and configuring a credential are mutually exclusive. Unset one of them.`,
    );
  }

  if (password !== undefined) {
    return { type: "configured", password, token };
  }
  if (token !== undefined) {
    return { type: "configured", token };
  }
  return { type: "none", insecureAllowNoAuth };
}

function resolveConfiguredBasePath(env: NodeJS.ProcessEnv): string {
  const raw = getEnv(env, "MOUSEHOLE_BASE_PATH");
  if (raw === undefined) return "";
  return parseEnvVar("MOUSEHOLE_BASE_PATH", basePathSchema, raw);
}

function resolveAllowedHosts(env: NodeJS.ProcessEnv): AllowedHostsConfig {
  const value = getEnv(env, "MOUSEHOLE_ALLOWED_HOSTS");
  if (value === undefined)
    return { type: "allowlist", hosts: DEFAULT_ALLOWED_HOSTS };
  if (value === "*") return { type: "all" };
  const hosts = parseCommaSeparated(value);
  if (hosts.length === 0) {
    throw new Error(
      "Invalid environment variable MOUSEHOLE_ALLOWED_HOSTS: must not be empty; use * to allow all hosts",
    );
  }
  return { type: "allowlist", hosts };
}

function resolveAllowedOriginsConfig(
  env: NodeJS.ProcessEnv,
): AllowedOriginsConfig {
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

export function buildConfig(
  env: NodeJS.ProcessEnv,
  readTextFileSync: (filePath: string) => string = defaultReadTextFileSync,
) {
  return {
    /**
     * The log level threshold, by name. Messages below this level are suppressed.
     *
     * Controlled by MOUSEHOLE_LOG_LEVEL. Valid values: error, warn, info (default), debug.
     */
    logLevel: resolveLogLevel(env),

    /**
     * The directory path where Mousehole stores its state.
     *
     * Defaults to "/var/lib/mousehole".
     */
    stateDirPath: getEnv(env, "MOUSEHOLE_STATE_DIR_PATH") ?? DEFAULT_STATE_DIR,

    /**
     * The number of seconds between automatic updates (contacts with MAM).
     *
     * Defaults to 300 seconds (5 minutes).
     */
    updateIntervalSeconds: resolveNumber(
      env,
      "MOUSEHOLE_UPDATE_INTERVAL_SECONDS",
      positiveNumberSchema,
      60 * 5,
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
     * The URL path prefix the whole app is served under, for hosting behind a
     * reverse proxy at e.g. https://host/mousehole/.
     *
     * Controlled by MOUSEHOLE_BASE_PATH. Defaults to "" (the origin root). A
     * non-empty value such as "/mousehole" must be a path: it carries no
     * scheme, host, query, fragment, "//", dot segments, or whitespace, and
     * surrounding whitespace and trailing slashes are normalised away.
     *
     * Unrelated to the Host/Origin allowlists, which stay host-only.
     */
    basePath: resolveConfiguredBasePath(env),

    /**
     * Whether to set the "Secure" flag on authentication cookies.
     *
     * Defaults to false.
     */
    httpsOnlyCookies: resolveFlag(env, "MOUSEHOLE_HTTPS_ONLY_COOKIES"),

    /**
     * Authentication configuration, derived from environment variables.
     */
    auth: resolveAuthConfig(env, readTextFileSync),

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

/**
 * The resolved application configuration. Built from the environment exactly
 * once, by the composition root (`startServer`) — there is no module-global
 * config; everything receives it explicitly.
 */
export type Config = ReturnType<typeof buildConfig>;
