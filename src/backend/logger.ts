import type { ILogObj } from "tslog";

import { formatWithOptions } from "node:util";
import { Logger } from "tslog";

import { config } from "#backend/config.ts";

export const logger = new Logger<ILogObj>({
  type: "pretty",
  minLevel: config.logLevel,
  hideLogPositionForProduction: true,
  stylePrettyLogs: process.stderr.isTTY ?? false,
  prettyLogTemplate: "[{{logLevelName}}] ",
  overwrite: {
    // rigamarole so we can write to stderr
    transportFormatted: (
      logMetaMarkup,
      logArgs,
      logErrors,
      _logMeta,
      settings,
    ) => {
      if (!settings) {
        process.stderr.write(logMetaMarkup + logArgs.join(" ") + "\n");
        return;
      }
      settings.prettyInspectOptions.colors = settings.stylePrettyLogs !== false;
      const formattedArgs = formatWithOptions(
        settings.prettyInspectOptions,
        ...logArgs,
      );
      const logErrorsString =
        logErrors.length > 0 && logArgs.length > 0
          ? "\n" + logErrors.join("\n")
          : logErrors.join("\n");
      process.stderr.write(
        logMetaMarkup + formattedArgs + logErrorsString + "\n",
      );
    },
  },
});
