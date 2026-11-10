import { constants, type Mode, type PathLike } from "fs";
import type { FileHandle } from "fs/promises";
import fs from "fs/promises";

import { removeFirstAndLastBrackets } from "./utils";

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

  /**
   * Returns the text that closes the array with the entries and the tail offset to write it at:
   * after the last value when pretty, at the closing bracket otherwise. The search runs on bytes,
   * since a byte of `]` or JSON whitespace never occurs inside a multi-byte UTF-8 character.
   */
  private buildInsertion(dataToWrite: unknown[], tail: Buffer, lastBracket: number) {
    const jsonString = removeFirstAndLastBrackets(
      JSON.stringify(dataToWrite, null, this.options.indent),
    );

    let valueEnd = lastBracket;
    while (valueEnd > 0 && isJsonWhitespace(tail[valueEnd - 1])) {
      valueEnd--;
    }

    const shouldInsertComma = valueEnd > 0 && tail[valueEnd - 1] !== OPENING_BRACKET;
    const maybeNewLine = this.options.pretty ? "\n" : "";
    const maybeIndentation = this.options.pretty ? " ".repeat(this.options.indent) : "";

    return {
      insertion: `${shouldInsertComma ? "," : ""}${maybeNewLine}${maybeIndentation}${jsonString}${maybeNewLine}]`,
      tailPosition: this.options.pretty ? valueEnd : lastBracket,
    };
  }

  /** Reads the last 50 bytes of the file, which hold the closing bracket the writer looks for. */
  private async readFileTail(fileHandle: MinimalFileHandle) {
    const { size } = await fileHandle.stat();
    const length = Math.min(size, 50);
    const readPosition = size - length;
    const tail = Buffer.alloc(length);

    await fileHandle.read(tail, 0, length, readPosition);

    return { tail, readPosition, size };
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
    const { tail, readPosition, size } = await this.readFileTail(fileHandle);

    if (tail.every(isJsonWhitespace) && this.options.initArray) {
      await writeAll(fileHandle, JSON.stringify(dataToWrite, null, this.options.indent), size);
      return;
    }

    const lastBracket = tail.lastIndexOf(CLOSING_BRACKET);

    if (lastBracket === -1) {
      throw new Error(
        "The file does not contain a valid JSON array. Please ensure the file contains a valid JSON array before appending data.",
      );
    }

    const { insertion, tailPosition } = this.buildInsertion(dataToWrite, tail, lastBracket);
    const writePosition = readPosition + tailPosition;
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

const OPENING_BRACKET = 0x5b;
const CLOSING_BRACKET = 0x5d;

/** Tells whether `byte` is JSON whitespace: space, tab, line feed or carriage return. */
function isJsonWhitespace(byte: number | undefined) {
  return byte === 0x20 || byte === 0x09 || byte === 0x0a || byte === 0x0d;
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
