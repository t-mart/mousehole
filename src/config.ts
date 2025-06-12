function environmentOrFallback<T>(
  name: string,
  fallback: T,
  mapFunction?: (s: string) => T
): T {
  const value = process.env[name];
  if (value === undefined) {
    return fallback;
  }
  if (mapFunction) {
    return mapFunction(value);
  }
  return value as T;
}

export const config = {
  userAgent: environmentOrFallback("USER_AGENT", "timtimtim-mam-updater/1.0"),
  mamSetSeedboxIpUrl: new URL(
    environmentOrFallback(
      "MAM_SET_SEEDBOX_IP_URL",
      "https://t.myanonamouse.net/json/dynamicSeedbox.php"
    )
  ),
  mamCookieName: environmentOrFallback("MAM_COOKIE_NAME", "mam_id"),
  stateDirPath: environmentOrFallback(
    "STATE_DIR_PATH",
    "/mam-vpn-ip-updater/state"
  ),
  setIntervalMilliseconds: environmentOrFallback(
    "SET_INTERVAL_MILLISECONDS",
    61 * 60 * 1000,
    (value) => Number.parseInt(value)
  ),
  ipServiceUrl: environmentOrFallback(
    "IP_SERVICE_URL",
    "https://api.ipify.org/?format=text"
  ),
  localTimezone: environmentOrFallback("TZ", "America/Chicago"),
  port: environmentOrFallback("PORT", 5010, (value) => Number.parseInt(value)),
};
