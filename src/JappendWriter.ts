import { constants, type Mode, type PathLike } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import fs from "node:fs/promises";

import { removeFirstAndLastBrackets } from "./utils.js";

/** Lists the `FileHandle` methods the writer calls. A test can pass an `InMemoryFileHandle`. */
export type MinimalFileHandle = Pick<FileHandle, "read" | "write" | "close" | "stat">;

export interface WriterOptions {
  /**
   * Sets the buffered entry count that makes `append` flush: a positive integer or `Infinity`.
   * Defaults to `1`. A running flush also writes the entries appended while it runs.
   */
  bufferFlushThreshold?: number;
  /**
   * Opens the file. Defaults to `fs.open`. A test can return an `InMemoryFileHandle` instead. Must
   * not open the file in append mode: the writer writes at positions, which Linux ignores there.
   */
  fileOpen?: (path: PathLike, flags?: string | number, mode?: Mode) => Promise<MinimalFileHandle>;
  /** Formats the JSON with newlines and `indent` spaces. Defaults to `true`. */
  pretty?: boolean;
  /** Sets the spaces per indent level when `pretty` is `true`. Defaults to `2`. */
  indent?: number;
  /**
   * Creates a missing file and starts the array in an empty file. Defaults to `true`. With `false`,
   * a flush to a missing or empty file fails.
   */
  initArray?: boolean;
  /**
   * Makes `append` send a failed threshold flush to `logger` instead of rejecting, so a caller can
   * leave `append` unawaited. Defaults to `false`. `flush` still rejects.
   */
  suppressThresholdFlushErrors?: boolean;
  /**
   * Receives the errors that `suppressThresholdFlushErrors` keeps from `append`. Defaults to
   * `console.error`.
   */
  logger?: {
    error: (message: string) => void;
  };
}

/**
 * Buffers entries and appends them to the JSON array in a file. A flush reads only the end of the
 * file, so memory use does not grow with the file size.
 */
export class JappendWriter {
  private readonly buffer: unknown[] = [];
  private readonly options: Required<WriterOptions>;
  private flushPromise?: Promise<void>;
  private isShutdown = false;

  constructor(
    private readonly filePath: string,
    options: WriterOptions,
  ) {
    validateOptions(filePath, options);
    this.options = this.convertOptions(options);
  }

  private convertOptions(options: WriterOptions): Required<WriterOptions> {
    const pretty = options.pretty ?? true;

    return {
      pretty,
      indent: pretty ? (options.indent ?? 2) : 0,
      initArray: options.initArray ?? true,
      fileOpen: options.fileOpen ?? fs.open,
      bufferFlushThreshold: options.bufferFlushThreshold ?? 1,
      suppressThresholdFlushErrors: options.suppressThresholdFlushErrors ?? false,
      logger: options.logger ?? {
        error: (message: string) => console.error(message),
      },
    };
  }

  private get isFull() {
    return this.buffer.length >= this.options.bufferFlushThreshold;
  }

  /**
   * Buffers `newData` and flushes when the buffer reaches `bufferFlushThreshold`. After a shutdown
   * flush, drops `newData`.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async append(newData: any) {
    if (this.isShutdown) {
      return;
    }

    this.buffer.push(newData);

    if (this.isFull) {
      try {
        await this.flush();
      } catch (error) {
        if (!this.options.suppressThresholdFlushErrors) {
          throw error;
        }

        this.options.logger.error(`Error flushing buffer on threshold: ${error}`);
      }
    }
  }

  /** Returns the entries as array items, without the brackets, in the writer's format. */
  private formatEntries(dataToWrite: unknown[]) {
    return removeFirstAndLastBrackets(JSON.stringify(dataToWrite, null, this.options.indent));
  }

  /**
   * Writes the buffer until it stays empty, including entries appended while the file closes. Ends
   * the flush in the step that sees the empty buffer, so a later `append` starts a new one.
   */
  private async ensureAllIsFlushed() {
    try {
      while (this.buffer.length > 0) {
        await this.writeBufferThroughOneHandle();
      }
    } finally {
      this.flushPromise = undefined;
    }
  }

  /**
   * Opens the file once, writes the buffer until it is empty and closes the file. On a failure,
   * puts the entries of the failed write back at the front of the buffer.
   */
  private async writeBufferThroughOneHandle() {
    // The writer opens the file read-write without append mode. On Linux an append-mode handle
    // writes at the end and ignores the position.
    const fileHandle = await this.options.fileOpen(
      this.filePath,
      this.options.initArray ? constants.O_RDWR | constants.O_CREAT : "r+",
    );
    let dataToWrite: unknown[] = [];

    try {
      while (this.buffer.length > 0) {
        dataToWrite = this.buffer.splice(0, this.buffer.length);
        await this.writeEntries(fileHandle, dataToWrite);
      }
    } catch (error) {
      this.buffer.unshift(...dataToWrite);
      throw error;
    } finally {
      await fileHandle.close();
    }
  }

  /**
   * Writes the entries over the closing bracket, padded with spaces to the length of the old tail,
   * so nothing of the old tail is left to cut off. A write that fails without writing anything
   * leaves the array as it was.
   */
  private async writeEntries(fileHandle: MinimalFileHandle, dataToWrite: unknown[]) {
    const { size } = await fileHandle.stat();
    const arrayEnd = await findArrayEnd(fileHandle, size);

    if (!arrayEnd) {
      if (!this.options.initArray) {
        throw new Error(NOT_AN_ARRAY);
      }
      await writeAll(fileHandle, JSON.stringify(dataToWrite, null, this.options.indent), size);
      return;
    }

    const { closingBracket, valueEnd, lastValueByte } = arrayEnd;
    const comma = lastValueByte === OPENING_BRACKET ? "" : ",";
    const newLine = this.options.pretty ? "\n" : "";
    const indentation = this.options.pretty ? " ".repeat(this.options.indent) : "";
    const insertion = `${comma}${newLine}${indentation}${this.formatEntries(dataToWrite)}${newLine}]`;
    // In pretty mode the writer starts a new line after the last value, so it writes over the
    // whitespace before the bracket.
    const writePosition = this.options.pretty ? valueEnd : closingBracket;
    const padding = " ".repeat(Math.max(0, size - writePosition - Buffer.byteLength(insertion)));

    await writeAll(fileHandle, insertion + padding, writePosition);
  }

  /**
   * Writes the buffered entries to the file. A call made while a flush runs returns that flush.
   * With `shutdown`, later `append` calls drop their data. A failed flush keeps its entries
   * buffered.
   */
  async flush({ shutdown }: { shutdown?: boolean } = {}): Promise<void> {
    if (shutdown) {
      this.isShutdown = true;
    }

    if (!this.flushPromise && this.buffer.length > 0) {
      this.flushPromise = this.ensureAllIsFlushed();
    }

    return this.flushPromise;
  }
}

const NOT_AN_ARRAY =
  "The file does not contain a valid JSON array. Please ensure the file contains a valid JSON array before appending data.";
const OPENING_BRACKET = 0x5b;
const CLOSING_BRACKET = 0x5d;

/** Tells whether `byte` is JSON whitespace: space, tab, line feed or carriage return. */
function isJsonWhitespace(byte: number | undefined) {
  return byte === 0x20 || byte === 0x09 || byte === 0x0a || byte === 0x0d;
}

/**
 * Returns the byte positions of the closing bracket and of the end of the value before it, and that
 * value's last byte, or nothing for a file of whitespace alone. Throws when the file does not end
 * in `]` after a value or `[`. Reads from the end in chunks, so any amount of whitespace works.
 */
async function findArrayEnd(fileHandle: MinimalFileHandle, size: number) {
  let closingBracket: number | undefined;

  for await (const { position, byte } of bytesFromTheEnd(fileHandle, size)) {
    if (isJsonWhitespace(byte)) {
      continue;
    }
    if (closingBracket === undefined) {
      if (byte !== CLOSING_BRACKET) {
        throw new Error(NOT_AN_ARRAY);
      }
      closingBracket = position;
      continue;
    }
    return { closingBracket, valueEnd: position + 1, lastValueByte: byte };
  }

  if (closingBracket !== undefined) {
    throw new Error(NOT_AN_ARRAY);
  }
  return undefined;
}

/**
 * Yields the bytes before `end` from the last to the first, with their positions. A byte of `]` or
 * JSON whitespace never occurs inside a multi-byte UTF-8 character, so the search decodes nothing.
 */
async function* bytesFromTheEnd(fileHandle: MinimalFileHandle, end: number) {
  const chunk = Buffer.alloc(4096);

  for (let chunkEnd = end; chunkEnd > 0;) {
    const start = Math.max(0, chunkEnd - chunk.length);
    const length = chunkEnd - start;

    await fileHandle.read(chunk, 0, length, start);
    for (let i = length - 1; i >= 0; i--) {
      yield { position: start + i, byte: chunk[i] };
    }
    chunkEnd = start;
  }
}

/**
 * Writes all of `text` at `position`. A file system can write fewer bytes than asked, as on a full
 * disk.
 */
async function writeAll(fileHandle: MinimalFileHandle, text: string, position: number) {
  const bytes = Buffer.from(text);
  let written = 0;

  while (written < bytes.length) {
    const { bytesWritten } = await fileHandle.write(
      bytes,
      written,
      bytes.length - written,
      position + written,
    );

    if (bytesWritten === 0) {
      throw new Error(`Wrote ${written} of ${bytes.length} bytes: the file system took no more`);
    }

    written += bytesWritten;
  }
}

function validateOptions(filePath: string, options: WriterOptions) {
  if (!filePath.trim()) {
    throw new Error(`File path must be a non-empty string, but got "${filePath}"`);
  }

  if (options.bufferFlushThreshold !== undefined) {
    const isBufferFlushThresholdOneOrGreater = options.bufferFlushThreshold >= 1;
    const isBufferFlushThresholdInteger = Number.isInteger(options.bufferFlushThreshold);
    const isBufferFlushThresholdInfinity =
      options.bufferFlushThreshold === Number.POSITIVE_INFINITY;

    const isValid =
      (isBufferFlushThresholdOneOrGreater && isBufferFlushThresholdInteger) ||
      isBufferFlushThresholdInfinity;

    if (!isValid) {
      throw new Error(
        `Entry buffer size must be one of: positive integer, Infinity, or undefined, but got ${options.bufferFlushThreshold}`,
      );
    }
  }

  if (options.indent !== undefined) {
    const isIndentZeroOrGreater = options.indent >= 0;
    const isIndentInteger = Number.isInteger(options.indent);

    const isValid = isIndentZeroOrGreater && isIndentInteger;

    if (!isValid) {
      throw new Error(
        `Indent must be one of: positive integer, 0, or undefined, but got ${options.indent}`,
      );
    }
  }
}
