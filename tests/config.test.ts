import { buildConfig } from "../src/backend/config.ts";

// buildConfig accepts a plain object so tests never touch process.env

describe("defaults (empty env)", () => {
  const config = buildConfig({});

  test("port defaults to 5010", () => {
    expect(config.port).toBe(5010);
  });

  test("updateIntervalSeconds defaults to 300", () => {
    expect(config.updateIntervalSeconds).toBe(300);
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

  test("defaults to /var/lib/mousehole when unset", () => {
    expect(buildConfig({}).stateDirPath).toBe("/var/lib/mousehole");
  });
});

// A hermetic stand-in for the file reader buildConfig injects for `*_FILE`
// secrets: serves the given path→contents map, and throws ENOENT like the real
// reader for anything else.
function fakeReader(files: Record<string, string>): (path: string) => string {
  return (path) => {
    const contents = files[path];
    if (contents === undefined) {
      const error = new Error(
        `ENOENT: no such file or directory, open '${path}'`,
      ) as NodeJS.ErrnoException;
      error.code = "ENOENT";
      throw error;
    }
    return contents;
  };
}

describe("MOUSEHOLE_AUTH_PASSWORD_FILE / MOUSEHOLE_AUTH_TOKEN_FILE (Docker secrets)", () => {
  test("reads the password from the file, trimmed", () => {
    const { auth } = buildConfig(
      { MOUSEHOLE_AUTH_PASSWORD_FILE: "/run/secrets/pw" },
      fakeReader({ "/run/secrets/pw": "  s3cr3t\n" }),
    );
    expect(auth).toEqual({
      type: "configured",
      password: "s3cr3t",
      token: undefined,
    });
  });

  test("reads the API token from a file too", () => {
    const { auth } = buildConfig(
      { MOUSEHOLE_AUTH_TOKEN_FILE: "/run/secrets/token" },
      fakeReader({ "/run/secrets/token": "tok\n" }),
    );
    expect(auth).toEqual({ type: "configured", token: "tok" });
  });

  test("_FILE takes precedence over the plain variable", () => {
    const { auth } = buildConfig(
      {
        MOUSEHOLE_AUTH_PASSWORD: "from-env",
        MOUSEHOLE_AUTH_PASSWORD_FILE: "/run/secrets/pw",
      },
      fakeReader({ "/run/secrets/pw": "from-file" }),
    );
    expect(auth).toMatchObject({ type: "configured", password: "from-file" });
  });

  test("a _FILE-provided credential satisfies the auth requirement", () => {
    // The must-have-auth check (server.ts) keys on auth.type !== "none".
    const { auth } = buildConfig(
      { MOUSEHOLE_AUTH_PASSWORD_FILE: "/run/secrets/pw" },
      fakeReader({ "/run/secrets/pw": "s3cr3t" }),
    );
    expect(auth.type).toBe("configured");
  });

  test("an empty/whitespace-only file is treated as no credential", () => {
    const { auth } = buildConfig(
      { MOUSEHOLE_AUTH_PASSWORD_FILE: "/run/secrets/pw" },
      fakeReader({ "/run/secrets/pw": "   \n  " }),
    );
    expect(auth).toEqual({ type: "none", insecureAllowNoAuth: false });
  });

  test("an empty _FILE overrides a set plain variable (precedence wins)", () => {
    const { auth } = buildConfig(
      {
        MOUSEHOLE_AUTH_PASSWORD: "from-env",
        MOUSEHOLE_AUTH_PASSWORD_FILE: "/run/secrets/pw",
      },
      fakeReader({ "/run/secrets/pw": "" }),
    );
    expect(auth).toEqual({ type: "none", insecureAllowNoAuth: false });
  });

  test("an unreadable file fails fast, naming the variable", () => {
    expect(() =>
      buildConfig(
        { MOUSEHOLE_AUTH_PASSWORD_FILE: "/run/secrets/missing" },
        fakeReader({}),
      ),
    ).toThrow("MOUSEHOLE_AUTH_PASSWORD_FILE");
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
  test.each<[string, number]>([
    ["8080", 8080],
    ["1", 1],
    ["65535", 65_535],
  ])("accepts %s -> %i", (value, expected) => {
    expect(buildConfig({ MOUSEHOLE_PORT: value }).port).toBe(expected);
  });

  test.each(["0", "65536", "-1", "banana", "5abc", "80.5"])(
    "rejects %s, naming the variable",
    (value) => {
      expect(() => buildConfig({ MOUSEHOLE_PORT: value })).toThrow(
        "MOUSEHOLE_PORT",
      );
    },
  );
});

// MOUSEHOLE_UPDATE_INTERVAL_SECONDS and MOUSEHOLE_MAM_REQUEST_TIMEOUT_SECONDS
// are the same "positive number" validator: any finite value above zero
// (fractions allowed) is accepted, anything else throws naming the variable.
function describePositiveNumberVariable(
  variableName: string,
  read: (config: ReturnType<typeof buildConfig>) => number,
  extra?: () => void,
): void {
  describe(variableName, () => {
    test.each<[string, number]>([
      ["30", 30],
      ["2.5", 2.5],
    ])("accepts %s -> %d", (value, expected) => {
      expect(read(buildConfig({ [variableName]: value }))).toBe(expected);
    });

    test.each(["0", "-1", "not-a-number"])(
      "rejects %s, naming the variable",
      (value) => {
        expect(() => buildConfig({ [variableName]: value })).toThrow(
          variableName,
        );
      },
    );

    extra?.();
  });
}

describePositiveNumberVariable(
  "MOUSEHOLE_UPDATE_INTERVAL_SECONDS",
  (config) => config.updateIntervalSeconds,
  () => {
    test("the retired MOUSEHOLE_CHECK_INTERVAL_SECONDS name is ignored", () => {
      // Hard rename, no alias: the old name falls back to the default.
      expect(
        buildConfig({ MOUSEHOLE_CHECK_INTERVAL_SECONDS: "60" })
          .updateIntervalSeconds,
      ).toBe(300);
    });
  },
);

describePositiveNumberVariable(
  "MOUSEHOLE_MAM_REQUEST_TIMEOUT_SECONDS",
  (config) => config.mamRequestTimeoutSeconds,
);

describe("MOUSEHOLE_SESSION_DURATION_SECONDS", () => {
  test("accepts a positive integer", () => {
    expect(
      buildConfig({ MOUSEHOLE_SESSION_DURATION_SECONDS: "3600" })
        .sessionDurationSeconds,
    ).toBe(3600);
  });

  // A duration must be a whole number of seconds, so a float is rejected too.
  test.each(["3600.5", "0", "one-week"])(
    "rejects %s, naming the variable",
    (value) => {
      expect(() =>
        buildConfig({ MOUSEHOLE_SESSION_DURATION_SECONDS: value }),
      ).toThrow("MOUSEHOLE_SESSION_DURATION_SECONDS");
    },
  );
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
    expect(() => buildConfig({ MOUSEHOLE_HTTPS_ONLY_COOKIES: "yes" })).toThrow(
      "MOUSEHOLE_HTTPS_ONLY_COOKIES",
    );
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
    expect(auth).toEqual({
      type: "configured",
      password: "s3cr3t",
      token: undefined,
    });
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
    expect(auth).toEqual({
      type: "configured",
      password: "s3cr3t",
      token: "tok",
    });
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
    expect(() => buildConfig({ MOUSEHOLE_ALLOWED_HOSTS: "  ,  ,  " })).toThrow(
      "MOUSEHOLE_ALLOWED_HOSTS",
    );
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
    expect(() => buildConfig({ MOUSEHOLE_ALLOWED_ORIGINS: "  ,  " })).toThrow(
      "MOUSEHOLE_ALLOWED_ORIGINS",
    );
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
