import { useId } from "react";

/**
 * Builds a dashed-ident that is stable across renders, and unique per
 * component instance. Handy for CSS custom properties.
 *
 * This hook provides the same guarantees as `useId`, but it returns a
 * [dashed-ident](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/dashed-ident) instead
 * of an arbitrary string. The returned value is suitable for use as a CSS custom
 * property name, e.g. `--my-component-abc123`.
 *
 * @param prefix optional text that prefixes the identifier, e.g. "copy-ip"
 * @returns a dashed-ident such as `--copy-ip-abc123` or `--abc123`
 */
export function useDashedIdent(prefix?: string): string {
  const id = replaceForDashedIdent(useId());
  return prefix ? `--${replaceForDashedIdent(prefix)}-${id}` : `--${id}`;
}

function replaceForDashedIdent(s: string): string {
  return s.replaceAll(/[^a-zA-Z0-9]/g, "-");
}
