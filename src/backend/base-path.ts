/**
 * URL path prefix handling: the path a deployment is mounted under.
 *
 * A path prefix is a URL path such as `/mousehole`, never a scheme or host, so
 * wherever one is interpolated (a redirect's `Location`, the shell's `<base>`,
 * a cookie's `Path`) the result can only ever be same-origin. The value comes
 * from `MOUSEHOLE_BASE_PATH` and is normalised once, at startup.
 *
 * Pure functions with no Hono dependency, so they can be unit-tested directly.
 */
import { WEB_BASE_URL } from "#shared/web-base-url.ts";

/**
 * One path segment. Deliberately narrow — URL-unreserved characters only — so
 * a value can never carry a query (`?`), fragment (`#`), backslash, whitespace,
 * control character, or an authority-looking `//`. `;`, `:`, and `%` are out as
 * well: a mount point never needs them, and allowing them only widens the set
 * of inputs that have to be reasoned about.
 */
const SEGMENT_PATTERN = /^[A-Za-z0-9._~-]+$/;

/**
 * Normalise a path prefix: surrounding whitespace and trailing slashes are
 * dropped and a leading `/` is added, so `mousehole/` and ` /mousehole ` both
 * become `/mousehole`. Returns `""` for the origin root and `undefined` when
 * `value` is not a usable path prefix.
 */
export function normalizeBasePath(value: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === "/") return "";

  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const stripped = withLeadingSlash.replace(/\/+$/, "");
  if (stripped === "") return "";

  // A double slash would read as an authority (a protocol-relative URL)
  // wherever the prefix is interpolated.
  if (stripped.includes("//")) return undefined;

  const segments = stripped.slice(1).split("/");
  const isUsable = segments.every(
    (segment) =>
      SEGMENT_PATTERN.test(segment) && segment !== "." && segment !== "..",
  );
  return isUsable ? stripped : undefined;
}

/**
 * The web UI's base for a mount: `<prefix>/web/`, which is `WEB_BASE_URL`
 * itself when no prefix is configured.
 */
export function webBaseFor(basePath: string): string {
  return `${basePath}${WEB_BASE_URL}`;
}
