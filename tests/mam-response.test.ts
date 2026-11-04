import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { MamResponse } from "#frontend/components/mam-response.tsx";
import type { PublicState } from "#shared/public-state.ts";

describe("MamResponse timestamps", () => {
  test.each([
    [
      "2026-11-04T12:09:17.461+01:00[UTC]",
      "2026-11-04T11:14:17.461+00:00[UTC]",
    ],
    [
      "2026-11-04T11:09:17.461+00:00[UTC]",
      "2026-11-04T12:14:17.461+01:00[UTC]",
    ],
    [
      "2026-11-04T12:09:17.461-08:00[America/Vancouver]",
      "2026-11-04T12:14:17.461-08:00[America/Vancouver]",
    ],
  ])(
    "renders the countdown despite timezone rule differences: %s",
    (at, nextContactAt) => {
      vi.spyOn(Date, "now").mockReturnValue(
        Date.parse(at.replace(/\[.*\]$/, "")),
      );
      const state: PublicState = {
        hasCookie: true,
        hasAuth: false,
        nextContactAt,
        lastMamContact: {
          at,
          reached: true,
          ip: "192.0.2.1",
          asn: 64_500,
          as: "TestAS",
          ipUpdate: {
            success: false,
            msg: "Invalid session - IP mismatch",
            httpStatus: 403,
          },
        },
      };

      const html = renderToStaticMarkup(createElement(MamResponse, { state }));

      expect(html).toContain("192.0.2.1");
      expect(html).toContain("Invalid session - IP mismatch");
      expect(html).toContain("Next update");
      expect(html).toContain("05:00");
    },
  );
});
