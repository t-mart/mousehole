// The list of documentation artifacts to produce. Add a capture here and it
// becomes selectable by name on the CLI (see record.ts).

import type { Capture } from "../capture.ts";

import { readmeDemo } from "./readme-demo.ts";

export const captures: readonly Capture[] = [readmeDemo];
