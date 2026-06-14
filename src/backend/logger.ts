import { inspect } from "node:util";

// The valid log level names, ordered from most to least verbose. This is the
// human-readable interface; the numeric ordering below is an internal detail.
export const LOG_LEVEL_NAMES = ["debug", "info", "warn", "error"] as const;
export type LogLevelName = (typeof LOG_LEVEL_NAMES)[number];
export const DEFAULT_LOG_LEVEL: LogLevelName = "info";

// Numeric ordering: lower is more verbose. A message is emitted when its level
// is at or above the configured threshold.
const LEVELS: Record<LogLevelName, number> = {
  debug: 2,
  info: 3,
  warn: 4,
  error: 5,
};

let threshold: LogLevelName = DEFAULT_LOG_LEVEL;

export function setLogLevel(level: LogLevelName): void {
  threshold = level;
}

const COLORS: Record<LogLevelName, string> = {
  debug: `\u001B[90m`, // gray
  info: `\u001B[36m`, // cyan
  warn: `\u001B[33m`, // yellow
  error: `\u001B[31m`, // red
};
const RESET = `\u001B[0m`;

const isProduction = process.env.NODE_ENV === "production";

// Color follows the destination stream's TTY-ness, but the NO_COLOR convention
// (https://no-color.org) takes precedence: if the variable is present at all
// (even empty), suppress ANSI regardless of TTY. Read from the environment here
// rather than from Config — color is an environment property like `isTTY`, and
// the logger must work before any config is built (startup itself logs).
function colorEnabled(stream: { isTTY?: boolean }): boolean {
  if (process.env.NO_COLOR !== undefined) return false;
  return stream.isTTY ?? false;
}

function emit(level: LogLevelName, args: unknown[]): void {
  if (LEVELS[level] < LEVELS[threshold]) return;
  // Per the Twelve-Factor App (https://12factor.net/logs), every level writes
  // its event stream to stdout; routing and storage are the environment's job.
  // Color follows stdout's TTY-ness.
  const useColor = colorEnabled(process.stdout);
  const label = level.toUpperCase();
  const prefix = useColor ? `${COLORS[level]}[${label}]${RESET}` : `[${label}]`;

  // When an Error is logged its multi-line rendering reads better on its own
  // line, so emit the prefix separately rather than prepending it.
  if (args.some((argument) => argument instanceof Error)) {
    console.log(prefix);
    // In production, render Errors via util.inspect (stack + cause chain, no
    // Bun source-code frame). In dev, pass the Error through so Bun prints its
    // rich code frame.
    if (isProduction) {
      console.log(
        ...args.map((argument) =>
          argument instanceof Error
            ? inspect(argument, { colors: useColor })
            : argument,
        ),
      );
    } else {
      console.log(...args);
    }
    return;
  }
  console.log(prefix, ...args);
}

export const logger = {
  debug: (...args: unknown[]) => emit("debug", args),
  info: (...args: unknown[]) => emit("info", args),
  warn: (...args: unknown[]) => emit("warn", args),
  error: (...args: unknown[]) => emit("error", args),
};
