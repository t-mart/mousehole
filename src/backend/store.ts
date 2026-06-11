import fs from "node:fs/promises";
import path from "node:path";

import {
  FileReadError,
  FileWriteError,
  DirectoryCreateError,
  JSONParseError,
} from "./error";
import { migrateToCurrent } from "./migrate";
import { deserializeState, serializeState, type State } from "./serde";

export class StateFileStore {
  private readonly stateDirectoryPath: string;
  private readonly statePath: string;

  constructor(stateDirectoryPath: string) {
    this.stateDirectoryPath = stateDirectoryPath;
    this.statePath = path.join(stateDirectoryPath, "state.json");
  }

  async read(): Promise<State> {
    const { statePath } = this;
    const file = Bun.file(statePath);
    let contents;
    try {
      contents = await file.text();
    } catch (error) {
      const cause = error instanceof Error ? error : new Error(String(error));
      throw new FileReadError(statePath, { cause });
    }
    let json: unknown;
    try {
      json = JSON.parse(contents);
    } catch (error) {
      const cause = error instanceof Error ? error : new Error(String(error));
      throw JSONParseError.fromFile(statePath, { cause });
    }
    return deserializeState(migrateToCurrent(json, statePath));
  }

  async readIfExists(): Promise<State | undefined> {
    try {
      return await this.read();
    } catch (error) {
      if (error instanceof FileReadError) {
        return undefined;
      }
      throw error;
    }
  }

  async write(state: State) {
    const { stateDirectoryPath, statePath } = this;
    const serializedState = serializeState(state);
    let contents;
    try {
      contents = JSON.stringify(serializedState, undefined, 2);
    } catch (error) {
      const cause = error instanceof Error ? error : new Error(String(error));
      throw JSONParseError.fromFile(statePath, { cause });
    }

    try {
      await fs.mkdir(stateDirectoryPath, { recursive: true });
    } catch (error) {
      const cause = error instanceof Error ? error : new Error(String(error));
      throw new DirectoryCreateError(stateDirectoryPath, { cause });
    }

    // Write to a temporary file first and then rename it to ensure atomic
    // writes. This is a millisecond-level race condition protection against
    // broken writes; unlikely, but why not be safe?
    const temporaryPath = `${statePath}.tmp`;
    try {
      await Bun.write(temporaryPath, contents);
      await fs.rename(temporaryPath, statePath);
    } catch (error) {
      const cause = error instanceof Error ? error : new Error(String(error));
      throw new FileWriteError(statePath, { cause });
    }
  }
}
