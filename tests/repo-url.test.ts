import { changelogUrl, docsUrl } from "#frontend/lib/repo-url.ts";

describe("repo-url", () => {
  test("docsUrl builds a link to a docs file", () => {
    expect(docsUrl("mam-errors.md")).toBe(
      "https://github.com/t-mart/mousehole/blob/master/docs/mam-errors.md",
    );
  });

  test("changelogUrl points at the changelog", () => {
    expect(changelogUrl).toBe(
      "https://github.com/t-mart/mousehole/blob/master/CHANGELOG.md",
    );
  });
});
