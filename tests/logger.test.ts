import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";

import { DEFAULT_LOG_LEVEL, logger, setLogLevel } from "#backend/logger.ts";

describe("logger", () => {
  let stdoutSpy: ReturnType<typeof spyOn<Console, "log">>;
  let stderrSpy: ReturnType<typeof spyOn<Console, "error">>;

  beforeEach(() => {
    stdoutSpy = spyOn(console, "log").mockImplementation(() => {});
    stderrSpy = spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    setLogLevel(DEFAULT_LOG_LEVEL);
  });

  it("routes error to stdout, never stderr", () => {
    logger.error("boom");
    expect(stdoutSpy).toHaveBeenCalledWith(
      expect.stringContaining("[ERROR]"),
      "boom",
    );
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it("routes info and warn to stdout only", () => {
    logger.info("hello");
    logger.warn("careful");
    expect(stdoutSpy).toHaveBeenCalledWith(
      expect.stringContaining("[INFO]"),
      "hello",
    );
    expect(stdoutSpy).toHaveBeenCalledWith(
      expect.stringContaining("[WARN]"),
      "careful",
    );
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it("keeps both lines of an Error rendering on stdout", () => {
    const failure = new Error("kaboom");
    logger.error(failure);
    // The prefix and the Error are emitted as separate writes, both to stdout.
    expect(stdoutSpy).toHaveBeenCalledTimes(2);
    expect(stdoutSpy).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("[ERROR]"),
    );
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it("suppresses levels below the threshold", () => {
    logger.debug("invisible");
    expect(stdoutSpy).not.toHaveBeenCalled();

    setLogLevel("debug");
    logger.debug("visible");
    expect(stdoutSpy).toHaveBeenCalledWith(
      expect.stringContaining("[DEBUG]"),
      "visible",
    );
  });

  it("emits only error when the threshold is error", () => {
    setLogLevel("error");
    logger.info("invisible");
    logger.warn("invisible");
    logger.error("visible");
    expect(stdoutSpy).toHaveBeenCalledTimes(1);
    expect(stdoutSpy).toHaveBeenCalledWith(
      expect.stringContaining("[ERROR]"),
      "visible",
    );
    expect(stderrSpy).not.toHaveBeenCalled();
  });
});
