import type { BigIntStats, StatOptions, Stats } from "node:fs";
import type { FileReadOptions, FileReadResult } from "node:fs/promises";

import type { MinimalFileHandle } from "../src/JappendWriter";

/**
 * Keeps a file's content in memory as bytes, as a real file does, and stands in for a `FileHandle`.
 */
export class InMemoryFileHandle implements MinimalFileHandle {
  #content: Buffer;

  public constructor({ initialContent }: { initialContent?: string } = {}) {
    this.#content = Buffer.from(initialContent ?? "");
  }

  /** Returns the content decoded as UTF-8. */
  public get content() {
    return this.#content.toString();
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

    const start = Math.min(position, this.#content.length);
    const bytesRead = this.#content.copy(buffer, offset, start, start + length);

    return Promise.resolve({ bytesRead } as FileReadResult<T>);
  }

  /**
   * Writes a string, or bytes of a `Buffer` from `offset`, at `position`, overwriting what is
   * there. A missing position writes at the end. A string write returns the whole content as
   * `buffer`.
   */
  write<TBuffer extends Uint8Array>(
    buffer: TBuffer,
    offset?: number | null,
    length?: number | null,
    position?: number | null,
  ): Promise<{ bytesWritten: number; buffer: TBuffer }>;
  write<TBuffer extends Uint8Array>(
    buffer: TBuffer,
    options?: { offset?: number; length?: number; position?: number },
  ): Promise<{ bytesWritten: number; buffer: TBuffer }>;
  write(
    data: string,
    position?: number | null,
    encoding?: BufferEncoding | null,
  ): Promise<{ bytesWritten: number; buffer: string }>;
  write(
    bufferOrData: Uint8Array | string,
    offsetOrOptionsOrPosition?:
      | number
      | null
      | { offset?: number; length?: number; position?: number },
    lengthOrEncoding?: number | null | BufferEncoding,
    bufferPosition?: number | null,
  ): Promise<{ bytesWritten: number; buffer: Uint8Array | string }> {
    let bytes: Buffer;
    let position: number | null | undefined;

    if (typeof bufferOrData === "string") {
      if (typeof offsetOrOptionsOrPosition === "object" && offsetOrOptionsOrPosition !== null) {
        throw new Error(`${InMemoryFileHandle.name} takes a number as the position of a string`);
      }
      bytes = Buffer.from(bufferOrData);
      position = offsetOrOptionsOrPosition;
    } else {
      const options =
        typeof offsetOrOptionsOrPosition === "object" && offsetOrOptionsOrPosition !== null
          ? offsetOrOptionsOrPosition
          : {
              offset: offsetOrOptionsOrPosition ?? undefined,
              length: typeof lengthOrEncoding === "number" ? lengthOrEncoding : undefined,
              position: bufferPosition ?? undefined,
            };
      const offset = options.offset ?? 0;
      const length = options.length ?? bufferOrData.byteLength - offset;

      bytes = Buffer.from(bufferOrData.subarray(offset, offset + length));
      position = options.position;
    }

    const at = position ?? this.#content.length;

    if (!Number.isInteger(at)) {
      throw new Error(
        `${InMemoryFileHandle.name} requires integer position to be specified for write operations`,
      );
    }

    if (at < 0 || at > this.#content.length) {
      throw new Error(`${InMemoryFileHandle.name} position out of bounds`);
    }

    this.#content = Buffer.concat([
      this.#content.subarray(0, at),
      bytes,
      this.#content.subarray(at + bytes.length),
    ]);

    return Promise.resolve({
      bytesWritten: bytes.length,
      buffer: typeof bufferOrData === "string" ? this.content : bufferOrData,
    });
  }

  async close(): Promise<void> {
    return Promise.resolve();
  }

  async truncate(length?: number): Promise<void> {
    this.#content = this.#content.subarray(0, length ?? this.#content.length);
    return Promise.resolve();
  }
}
