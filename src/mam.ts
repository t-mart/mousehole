import { Temporal } from "temporal-polyfill";
import { Cookie } from "tough-cookie";

import { writeLastAttempt } from "./attempt.js";
import { config } from "./config.js";
import { readCookieValue, writeCookieValue } from "./cookie-file.js";

export async function setMamSeedboxIp() {
  const currentCookiedValue = await readCookieValue();

  const cookie = new Cookie({
    key: config.mamCookieName,
    value: currentCookiedValue,
  });

  const headers = {
    "User-Agent": config.userAgent,
    Cookie: cookie.cookieString(),
  };

  let response;
  try {
    // by making this GET request, we update the seedbox IP on MaM. The IP address
    // is determined by the server from the request.
    response = await fetch(config.mamSetSeedboxIpUrl, {
      headers,
    });
  } catch (error) {
    await writeLastAttempt({
      success: false,
      message: `Error updating seedbox IP: ${String(error)}`,
    });
    throw error;
  }

  const json = await response.json();

  if (response.ok) {
    let nextCookieValue;
    for (const [headerName, headerValue] of response.headers.entries()) {
      if (headerName.toLowerCase() === "set-cookie") {
        const headerCookie = Cookie.parse(headerValue);
        if (headerCookie && headerCookie.key === config.mamCookieName) {
          nextCookieValue = headerCookie.value;
          writeCookieValue(headerCookie.value);
          break;
        }
      }
    }
    if (!nextCookieValue) {
      console.warn(
        `No Set-Cookie header found for ${config.mamCookieName}. Cookie may not have been updated.`
      );
      nextCookieValue = currentCookiedValue; // fallback to current value
    }

    await writeCookieValue(nextCookieValue);
    const partialAttempt = {
      success: true,
      message: "Seedbox IP updated successfully.",
      publicIp: await fetchPublicIp(),
      oldCookieValue: currentCookiedValue,
      newCookieValue: nextCookieValue,
      responseJson: json,
    };
    const attempt = await writeLastAttempt(partialAttempt);
    return attempt;
  } else {
    await writeLastAttempt({
      success: false,
      message: `Failed to update seedbox IP: ${response.status} ${response.statusText} ${JSON.stringify(json)}`,
      responseJson: json,
    });
    throw new Error(
      `Failed to update seedbox IP: ${response.status} ${response.statusText} ${JSON.stringify(json)}`
    );
  }
}

export function setNowAndScheduleNext() {
  setMamSeedboxIp()
    .then(({ publicIp }) => {
      console.log(`IP updated successfully to ${publicIp}`);
    })
    .catch((error) => {
      console.error("Error:", error);
    })
    .finally(() => {
      // Schedule the next update
      setTimeout(setNowAndScheduleNext, config.setIntervalMilliseconds);
      const nextUpdateTime = Temporal.Now.zonedDateTimeISO(
        config.localTimezone
      ).add({ milliseconds: config.setIntervalMilliseconds });
      console.log(`Next update scheduled for ${nextUpdateTime.toString()}`);
    });
}

async function fetchPublicIp() {
  const response = await fetch(config.ipServiceUrl);
  if (!response.ok) {
    return "<failed to fetch public IP>";
  }
  const publicIp = await response.text();
  return publicIp.trim();
}
