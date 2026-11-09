import type { BigIntStats, StatOptions, Stats } from "fs";
import type { FileReadOptions, FileReadResult } from "fs/promises";

import type { MinimalFileHandle } from "../src/JappendWriter";

export class InMemoryFileHandle implements MinimalFileHandle {
  #content: string;

  public constructor({ initialContent }: { initialContent?: string } = {}) {
    this.#content = initialContent ?? "";
  }

  public get content() {
    return this.#content;
  }

  stat(opts?: (StatOptions & { bigint?: false | undefined }) | undefined): Promise<Stats>;
  stat(opts: StatOptions & { bigint: true }): Promise<BigIntStats>;
  stat(opts?: (StatOptions & { bigint?: boolean }) | undefined): Promise<Stats | BigIntStats> {
    if (opts) {
      throw new Error(`${InMemoryFileHandle.name} does not support options for stat operations`);
    }

    return Promise.resolve({
      size: this.#content.length,
    } as Stats | BigIntStats);
  }

  async read<T extends NodeJS.ArrayBufferView>(
    bufferOrOptions?: T | null | FileReadOptions<T>,
    offsetOrOptions?: number | null | FileReadOptions<T>,
    length?: number,
    position?: number,
  ): Promise<FileReadResult<T>> {
    const buffer = bufferOrOptions;

    if (!(buffer instanceof Buffer)) {
      throw new Error(`${InMemoryFileHandle.name} only supports Buffer for read operations`);
    }

    if (length === undefined || !Number.isInteger(length)) {
      throw new Error(
        `${InMemoryFileHandle.name} requires integer length to be specified for read operations`,
      );
    }

    const offset = typeof offsetOrOptions === "number" ? offsetOrOptions : undefined;

    if (offset === undefined || !Number.isInteger(offset)) {
      throw new Error(
        `${InMemoryFileHandle.name} requires integer offset to be specified for read operations`,
      );
    }

    if (position === undefined || !Number.isInteger(position)) {
      throw new Error(
        `${InMemoryFileHandle.name} requires integer position to be specified for read operations`,
      );
    }

    const data = this.#content.slice(position, position + length);

    buffer.fill(data, offset, offset + data.length);

    return Promise.resolve({
      bytesRead: data.length,
    } as FileReadResult<T>);
  }

  write<TBuffer extends Uint8Array>(
    bufferOrData: TBuffer | string,
    offsetOrOptionsOrPosition?:
      | number
      | null
      | { offset?: number; length?: number; position?: number },
  ): Promise<{
    bytesWritten: number;
    buffer: string;
  }> {
    const data = bufferOrData;

    if (typeof data !== "string") {
      throw new Error(`${InMemoryFileHandle.name} only supports string for write operations`);
    }

    let position = offsetOrOptionsOrPosition;

    if (position !== undefined && (typeof position !== "number" || !Number.isInteger(position))) {
      throw new Error(
        `${InMemoryFileHandle.name} requires integer position to be specified for write operations`,
      );
    }

    if (position === undefined) {
      position = this.#content.length;
    }

    if (position < 0 || position > this.#content.length) {
      throw new Error(`${InMemoryFileHandle.name} position out of bounds`);
    }

    this.#content =
      this.#content.slice(0, position) + data + this.#content.slice(position + data.length);

    return Promise.resolve({
      bytesWritten: data.length,
      buffer: this.#content,
    } as {
      bytesWritten: number;
      buffer: string;
    });
  }

  async close(): Promise<void> {
    return Promise.resolve();
  }

  async truncate(length?: number): Promise<void> {
    this.#content = this.#content.slice(0, length ?? this.#content.length);
    return Promise.resolve();
  }
}
