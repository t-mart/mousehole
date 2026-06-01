import { createConsola } from "consola";

import { config } from "#backend/config.ts";

export const logger = createConsola({
  level: config.logLevel,
  formatOptions: {
    date: false,
  },
});
