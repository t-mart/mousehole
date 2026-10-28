/**
 * Backend endpoint URLs, resolved from the document's declared base.
 *
 * Every API endpoint lives one path segment up from the UI mount: the server
 * serves the app at `<prefix>/web/` and its API at `<prefix>/<endpoint>`. Using
 * `document.baseURI` — the `<base href>` the server writes, always ending in
 * `/` — makes `../<endpoint>` resolve to `<prefix>/<endpoint>` without the
 * caller knowing the prefix, or assuming the app sits at the origin root.
 */
export function resolveApiUrl(baseURI: string, endpoint: string): URL {
  return new URL(`../${endpoint}`, baseURI);
}

/**
 * {@link resolveApiUrl} against the page's declared base. `endpoint` is a bare
 * name such as `state`, not a path: it is appended to `../`.
 */
export function apiUrl(endpoint: string): URL {
  return resolveApiUrl(document.baseURI, endpoint);
}
