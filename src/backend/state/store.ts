import fs from "node:fs/promises";
import path from "node:path";

import {
  FileReadError,
  FileWriteError,
  DirectoryCreateError,
  JSONParseError,
  toError,
} from "../error";
import { migrateToCurrent } from "./migrate";
import { deserializeState, serializeState, type State } from "./serde";

export class StateFileStore {
  private readonly stateDirectoryPath: string;
  private readonly statePath: string;

  constructor(stateDirectoryPath: string) {
    this.stateDirectoryPath = stateDirectoryPath;
    this.statePath = path.join(stateDirectoryPath, "state.json");
  }

  /**
   * Read the state, or `undefined` when no state file exists yet. Only a
   * missing file reads as a fresh install — anything else (permissions, IO,
   * corruption) surfaces, since treating it as "no state" would let the next
   * contact write a cookieless state over the real one.
   */
  async readIfExists(): Promise<State | undefined> {
    const { statePath } = this;
    let contents;
    try {
      contents = await Bun.file(statePath).text();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return undefined;
      }
      throw new FileReadError(statePath, { cause: toError(error) });
    }
    let json: unknown;
    try {
      json = JSON.parse(contents);
    } catch (error) {
      throw JSONParseError.fromFile(statePath, { cause: toError(error) });
    }
    return deserializeState(migrateToCurrent(json, statePath));
  }

  async write(state: State) {
    const { stateDirectoryPath, statePath } = this;
    const contents = JSON.stringify(serializeState(state), undefined, 2);

    try {
      await fs.mkdir(stateDirectoryPath, { recursive: true });
    } catch (error) {
      throw new DirectoryCreateError(stateDirectoryPath, {
        cause: toError(error),
      });
    }

    // Write to a temporary file first and then rename it to ensure atomic
    // writes. This is a millisecond-level race condition protection against
    // broken writes; unlikely, but why not be safe?
    const temporaryPath = `${statePath}.tmp`;
    try {
      await Bun.write(temporaryPath, contents);
      await fs.rename(temporaryPath, statePath);
    } catch (error) {
      throw new FileWriteError(statePath, { cause: toError(error) });
    }
  }
}
