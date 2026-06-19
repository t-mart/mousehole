// ffmpeg postprocessing presets a capture can attach via `postprocess`. Each
// returns the ffmpeg argument list the runner shells out with. Roll your own
// FfmpegPost inline for anything these don't cover.

import type { FfmpegPost } from "./capture.ts";

export interface WebpOptions {
  // Frame rate of the output loop. Default 24.
  fps?: number;
  // libwebp quality, 0-100. Default 70.
  quality?: number;
  // Seconds to drop from the start, to trim an unstable lead-in.
  startAtSeconds?: number;
}

// Convert a recorded .webm into an animated, looping .webp (good for embedding
// in a README).
export function webp(options: WebpOptions = {}): FfmpegPost {
  const fps = options.fps ?? 24;
  const quality = options.quality ?? 70;
  const trim = options.startAtSeconds
    ? ["-ss", String(options.startAtSeconds)]
    : [];

  return {
    ext: "webp",
    args: ({ input, output }) => [
      "-y",
      ...trim,
      "-i",
      input,
      "-an",
      "-vcodec",
      "libwebp",
      "-filter:v",
      `fps=${fps}`,
      "-loop",
      "0",
      "-q:v",
      String(quality),
      output,
    ],
  };
}
