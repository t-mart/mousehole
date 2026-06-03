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

const useColor = process.stderr.isTTY ?? false;

function emit(level: LogLevelName, args: unknown[]): void {
  if (LEVELS[level] < LEVELS[threshold]) return;
  const label = level.toUpperCase();
  const prefix = useColor ? `${COLORS[level]}[${label}]${RESET}` : `[${label}]`;
  // console.error writes to stderr and formats args via util.formatWithOptions,
  // which renders Error stacks + cause chains and colorizes inspected objects
  // when stderr is a TTY.
  console.error(prefix, ...args);
}

export const logger = {
  debug: (...args: unknown[]) => emit("debug", args),
  info: (...args: unknown[]) => emit("info", args),
  warn: (...args: unknown[]) => emit("warn", args),
  error: (...args: unknown[]) => emit("error", args),
};
