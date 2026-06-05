import { describe, expect, test } from "bun:test";

import { buildConfig } from "../src/backend/config.ts";

// buildConfig accepts a plain object so tests never touch process.env

describe("defaults (empty env)", () => {
  const config = buildConfig({});

  test("port defaults to 5010", () => {
    expect(config.port).toBe(5010);
  });

  test("checkIntervalSeconds defaults to 300", () => {
    expect(config.checkIntervalSeconds).toBe(300);
  });

  test("mamRequestTimeoutSeconds defaults to 10", () => {
    expect(config.mamRequestTimeoutSeconds).toBe(10);
  });

  test("sessionDurationSeconds defaults to 604800", () => {
    expect(config.sessionDurationSeconds).toBe(604_800);
  });

  test("httpsOnlyCookies defaults to false", () => {
    expect(config.httpsOnlyCookies).toBe(false);
  });

  test("allowedHosts defaults to loopback allowlist", () => {
    expect(config.allowedHosts).toEqual({
      type: "allowlist",
      hosts: ["localhost", "127.0.0.1", "[::1]"],
    });
  });

  test("allowedOrigins defaults to same-origin", () => {
    expect(config.allowedOrigins).toEqual({ type: "same-origin" });
  });

  test("auth defaults to none with insecureAllowNoAuth=false", () => {
    expect(config.auth).toEqual({ type: "none", insecureAllowNoAuth: false });
  });
});

describe("MOUSEHOLE_STATE_DIR_PATH", () => {
  test("overrides the default state directory", () => {
    expect(
      buildConfig({ MOUSEHOLE_STATE_DIR_PATH: "/custom/path" }).stateDirPath,
    ).toBe("/custom/path");
  });

  test("override produces no deprecation warning", () => {
    expect(
      buildConfig({ MOUSEHOLE_STATE_DIR_PATH: "/custom/path" })
        .stateDirPathDeprecationWarning,
    ).toBeUndefined();
  });
});

describe("MOUSEHOLE_LOG_LEVEL", () => {
  for (const level of ["error", "warn", "info", "debug"] as const) {
    test(`accepts "${level}"`, () => {
      expect(() => buildConfig({ MOUSEHOLE_LOG_LEVEL: level })).not.toThrow();
    });
  }

  test("is case-insensitive", () => {
    expect(() => buildConfig({ MOUSEHOLE_LOG_LEVEL: "DEBUG" })).not.toThrow();
    expect(() => buildConfig({ MOUSEHOLE_LOG_LEVEL: "Info" })).not.toThrow();
  });

  test("throws on unknown value", () => {
    expect(() => buildConfig({ MOUSEHOLE_LOG_LEVEL: "verbose" })).toThrow(
      "MOUSEHOLE_LOG_LEVEL",
    );
  });
});

describe("MOUSEHOLE_PORT", () => {
  test("accepts valid port", () => {
    expect(buildConfig({ MOUSEHOLE_PORT: "8080" }).port).toBe(8080);
  });

  test("accepts min port 1", () => {
    expect(buildConfig({ MOUSEHOLE_PORT: "1" }).port).toBe(1);
  });

  test("accepts max port 65535", () => {
    expect(buildConfig({ MOUSEHOLE_PORT: "65535" }).port).toBe(65_535);
  });

  test("throws on 0", () => {
    expect(() => buildConfig({ MOUSEHOLE_PORT: "0" })).toThrow("MOUSEHOLE_PORT");
  });

  test("throws on 65536", () => {
    expect(() => buildConfig({ MOUSEHOLE_PORT: "65536" })).toThrow(
      "MOUSEHOLE_PORT",
    );
  });

  test("throws on negative", () => {
    expect(() => buildConfig({ MOUSEHOLE_PORT: "-1" })).toThrow("MOUSEHOLE_PORT");
  });

  test("throws on non-numeric", () => {
    expect(() => buildConfig({ MOUSEHOLE_PORT: "banana" })).toThrow(
      "MOUSEHOLE_PORT",
    );
  });

  test("throws on partial parse (5abc)", () => {
    expect(() => buildConfig({ MOUSEHOLE_PORT: "5abc" })).toThrow("MOUSEHOLE_PORT");
  });

  test("throws on float", () => {
    expect(() => buildConfig({ MOUSEHOLE_PORT: "80.5" })).toThrow("MOUSEHOLE_PORT");
  });
});

describe("MOUSEHOLE_CHECK_INTERVAL_SECONDS", () => {
  test("accepts positive integer", () => {
    expect(
      buildConfig({ MOUSEHOLE_CHECK_INTERVAL_SECONDS: "60" })
        .checkIntervalSeconds,
    ).toBe(60);
  });

  test("accepts positive float", () => {
    expect(
      buildConfig({ MOUSEHOLE_CHECK_INTERVAL_SECONDS: "0.5" })
        .checkIntervalSeconds,
    ).toBe(0.5);
  });

  test("throws on zero", () => {
    expect(() =>
      buildConfig({ MOUSEHOLE_CHECK_INTERVAL_SECONDS: "0" }),
    ).toThrow("MOUSEHOLE_CHECK_INTERVAL_SECONDS");
  });

  test("throws on negative", () => {
    expect(() =>
      buildConfig({ MOUSEHOLE_CHECK_INTERVAL_SECONDS: "-1" }),
    ).toThrow("MOUSEHOLE_CHECK_INTERVAL_SECONDS");
  });

  test("throws on non-numeric", () => {
    expect(() =>
      buildConfig({ MOUSEHOLE_CHECK_INTERVAL_SECONDS: "never" }),
    ).toThrow("MOUSEHOLE_CHECK_INTERVAL_SECONDS");
  });
});

describe("MOUSEHOLE_MAM_REQUEST_TIMEOUT_SECONDS", () => {
  test("accepts positive value", () => {
    expect(
      buildConfig({ MOUSEHOLE_MAM_REQUEST_TIMEOUT_SECONDS: "30" })
        .mamRequestTimeoutSeconds,
    ).toBe(30);
  });

  test("accepts fractional value", () => {
    expect(
      buildConfig({ MOUSEHOLE_MAM_REQUEST_TIMEOUT_SECONDS: "2.5" })
        .mamRequestTimeoutSeconds,
    ).toBe(2.5);
  });

  test("throws on zero", () => {
    expect(() =>
      buildConfig({ MOUSEHOLE_MAM_REQUEST_TIMEOUT_SECONDS: "0" }),
    ).toThrow("MOUSEHOLE_MAM_REQUEST_TIMEOUT_SECONDS");
  });

  test("throws on negative", () => {
    expect(() =>
      buildConfig({ MOUSEHOLE_MAM_REQUEST_TIMEOUT_SECONDS: "-1" }),
    ).toThrow("MOUSEHOLE_MAM_REQUEST_TIMEOUT_SECONDS");
  });

  test("throws on non-numeric", () => {
    expect(() =>
      buildConfig({ MOUSEHOLE_MAM_REQUEST_TIMEOUT_SECONDS: "soon" }),
    ).toThrow("MOUSEHOLE_MAM_REQUEST_TIMEOUT_SECONDS");
  });
});

describe("MOUSEHOLE_SESSION_DURATION_SECONDS", () => {
  test("accepts positive integer", () => {
    expect(
      buildConfig({ MOUSEHOLE_SESSION_DURATION_SECONDS: "3600" })
        .sessionDurationSeconds,
    ).toBe(3600);
  });

  test("throws on float", () => {
    expect(() =>
      buildConfig({ MOUSEHOLE_SESSION_DURATION_SECONDS: "3600.5" }),
    ).toThrow("MOUSEHOLE_SESSION_DURATION_SECONDS");
  });

  test("throws on zero", () => {
    expect(() =>
      buildConfig({ MOUSEHOLE_SESSION_DURATION_SECONDS: "0" }),
    ).toThrow("MOUSEHOLE_SESSION_DURATION_SECONDS");
  });

  test("throws on non-numeric", () => {
    expect(() =>
      buildConfig({ MOUSEHOLE_SESSION_DURATION_SECONDS: "one-week" }),
    ).toThrow("MOUSEHOLE_SESSION_DURATION_SECONDS");
  });
});

describe("boolean flags (MOUSEHOLE_HTTPS_ONLY_COOKIES, MOUSEHOLE_INSECURE_ALLOW_NO_AUTH)", () => {
  test("MOUSEHOLE_HTTPS_ONLY_COOKIES=true sets httpsOnlyCookies", () => {
    expect(
      buildConfig({ MOUSEHOLE_HTTPS_ONLY_COOKIES: "true" }).httpsOnlyCookies,
    ).toBe(true);
  });

  test("MOUSEHOLE_HTTPS_ONLY_COOKIES=false sets httpsOnlyCookies to false", () => {
    expect(
      buildConfig({ MOUSEHOLE_HTTPS_ONLY_COOKIES: "false" }).httpsOnlyCookies,
    ).toBe(false);
  });

  test("MOUSEHOLE_HTTPS_ONLY_COOKIES throws on invalid value", () => {
    expect(() =>
      buildConfig({ MOUSEHOLE_HTTPS_ONLY_COOKIES: "yes" }),
    ).toThrow("MOUSEHOLE_HTTPS_ONLY_COOKIES");
  });

  test("MOUSEHOLE_INSECURE_ALLOW_NO_AUTH=true sets insecureAllowNoAuth", () => {
    const { auth } = buildConfig({ MOUSEHOLE_INSECURE_ALLOW_NO_AUTH: "true" });
    expect(auth).toEqual({ type: "none", insecureAllowNoAuth: true });
  });

  test("MOUSEHOLE_INSECURE_ALLOW_NO_AUTH throws on invalid value", () => {
    expect(() =>
      buildConfig({ MOUSEHOLE_INSECURE_ALLOW_NO_AUTH: "1" }),
    ).toThrow("MOUSEHOLE_INSECURE_ALLOW_NO_AUTH");
  });
});

describe("MOUSEHOLE_AUTH_PASSWORD / MOUSEHOLE_AUTH_TOKEN", () => {
  test("password-only yields configured auth with password", () => {
    const { auth } = buildConfig({ MOUSEHOLE_AUTH_PASSWORD: "s3cr3t" });
    expect(auth).toEqual({ type: "configured", password: "s3cr3t", token: undefined });
  });

  test("token-only yields configured auth with token", () => {
    const { auth } = buildConfig({ MOUSEHOLE_AUTH_TOKEN: "tok" });
    expect(auth).toEqual({ type: "configured", token: "tok" });
  });

  test("both password and token are accepted simultaneously", () => {
    const { auth } = buildConfig({
      MOUSEHOLE_AUTH_PASSWORD: "s3cr3t",
      MOUSEHOLE_AUTH_TOKEN: "tok",
    });
    expect(auth).toEqual({ type: "configured", password: "s3cr3t", token: "tok" });
  });

  test("neither yields auth type none", () => {
    expect(buildConfig({}).auth.type).toBe("none");
  });
});

describe("MOUSEHOLE_ALLOWED_HOSTS", () => {
  test("* yields type all", () => {
    expect(buildConfig({ MOUSEHOLE_ALLOWED_HOSTS: "*" }).allowedHosts).toEqual({
      type: "all",
    });
  });

  test("comma-separated list yields allowlist", () => {
    expect(
      buildConfig({ MOUSEHOLE_ALLOWED_HOSTS: "example.com,10.0.0.1" })
        .allowedHosts,
    ).toEqual({ type: "allowlist", hosts: ["example.com", "10.0.0.1"] });
  });

  test("single entry yields allowlist", () => {
    expect(
      buildConfig({ MOUSEHOLE_ALLOWED_HOSTS: "example.com" }).allowedHosts,
    ).toEqual({ type: "allowlist", hosts: ["example.com"] });
  });

  test("trims whitespace around entries", () => {
    expect(
      buildConfig({ MOUSEHOLE_ALLOWED_HOSTS: " example.com , 10.0.0.1 " })
        .allowedHosts,
    ).toEqual({ type: "allowlist", hosts: ["example.com", "10.0.0.1"] });
  });

  test("throws on empty value (all-whitespace entries)", () => {
    expect(() =>
      buildConfig({ MOUSEHOLE_ALLOWED_HOSTS: "  ,  ,  " }),
    ).toThrow("MOUSEHOLE_ALLOWED_HOSTS");
  });
});

describe("MOUSEHOLE_ALLOWED_ORIGINS", () => {
  test("* yields type all", () => {
    expect(
      buildConfig({ MOUSEHOLE_ALLOWED_ORIGINS: "*" }).allowedOrigins,
    ).toEqual({ type: "all" });
  });

  test("comma-separated origins yield allowlist", () => {
    expect(
      buildConfig({
        MOUSEHOLE_ALLOWED_ORIGINS: "https://a.example.com,http://b.example.com",
      }).allowedOrigins,
    ).toEqual({
      type: "allowlist",
      origins: ["https://a.example.com", "http://b.example.com"],
    });
  });

  test("throws on empty value", () => {
    expect(() =>
      buildConfig({ MOUSEHOLE_ALLOWED_ORIGINS: "  ,  " }),
    ).toThrow("MOUSEHOLE_ALLOWED_ORIGINS");
  });
});

describe("whitespace handling", () => {
  test("env vars with only whitespace are treated as unset", () => {
    expect(buildConfig({ MOUSEHOLE_PORT: "   " }).port).toBe(5010);
  });

  test("leading/trailing whitespace in values is trimmed", () => {
    expect(buildConfig({ MOUSEHOLE_PORT: "  8080  " }).port).toBe(8080);
  });
});
