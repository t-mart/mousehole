import fs from "node:fs/promises";
import path from "node:path";

import { config } from "./config";
import {
  FileReadError,
  FileWriteError,
  JSONParseError,
  SchemaError,
} from "./error";
import { deserializeState, serializeState } from "./serde";
import { serializedStateSchema, type State } from "./types";

const statePath = path.join(config.stateDirPath, "state.json");

class StateFileStore {
  async read(): Promise<State> {
    const file = Bun.file(statePath);
    let contents;
    try {
      contents = await file.text();
    } catch (error) {
      if (error instanceof Error) {
        throw new FileReadError(statePath, { cause: error });
      }
      throw error;
    }
    let json;
    try {
      json = JSON.parse(contents);
    } catch (error) {
      if (error instanceof Error) {
        throw JSONParseError.fromFile(statePath, { cause: error });
      }
      throw error;
    }
    const { data: serializedState, error } =
      serializedStateSchema.safeParse(json);
    if (error) {
      throw SchemaError.fromExternalSource(statePath, { cause: error });
    }
    return deserializeState(serializedState);
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
    const serializedState = serializeState(state);
    let contents;
    try {
      contents = JSON.stringify(serializedState, undefined, 2);
    } catch (error) {
      if (error instanceof Error) {
        throw JSONParseError.fromFile(statePath, { cause: error });
      }
      throw error;
    }

    try {
      await fs.mkdir(config.stateDirPath, { recursive: true });
    } catch (error) {
      if (error instanceof Error) {
        throw new FileWriteError(statePath, { cause: error });
      }
      throw error;
    }

    const file = Bun.file(statePath);
    try {
      await file.write(contents);
    } catch (error) {
      if (error instanceof Error) {
        throw new FileWriteError(statePath, { cause: error });
      }
      throw error;
    }
  }
}

export const stateFile = new StateFileStore();
