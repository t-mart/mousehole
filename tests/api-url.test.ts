import { resolveApiUrl } from "../src/frontend/lib/api-url.ts";

describe("resolveApiUrl", () => {
  test("resolves to the origin root from the root mount", () => {
    expect(resolveApiUrl("https://host/web/", "state").toString()).toBe(
      "https://host/state",
    );
  });

  test("stays inside a configured prefix", () => {
    expect(resolveApiUrl("https://host/mousehole/web/", "state").pathname).toBe(
      "/mousehole/state",
    );
  });

  test("carries every endpoint one segment up from the mount", () => {
    for (const endpoint of [
      "login",
      "logout",
      "cookie",
      "updates",
      "events",
      "state",
    ]) {
      expect(
        resolveApiUrl("https://host/mousehole/web/", endpoint).pathname,
      ).toBe(`/mousehole/${endpoint}`);
    }
  });
});
