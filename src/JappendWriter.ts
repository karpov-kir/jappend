import type { Mode, PathLike } from "fs";
import type { FileHandle } from "fs/promises";
import fs from "fs/promises";

import { countNewLinesAndSpacesBeforeLastBracket, removeFirstAndLastBrackets } from "./utils";

/** Lists the `FileHandle` methods the writer calls. A test can pass an `InMemoryFileHandle`. */
export type MinimalFileHandle = Pick<FileHandle, "read" | "write" | "close" | "truncate" | "stat">;

export interface WriterOptions {
  /**
   * Sets the buffered entry count that makes `append` flush: a positive integer or `Infinity`.
   * Defaults to `1`. A running flush also writes the entries appended before it closes the file. An
   * entry appended while it closes the file waits for the next flush.
   */
  bufferFlushThreshold?: number;
  /** Opens the file. Defaults to `fs.open`. A test can return an `InMemoryFileHandle` instead. */
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

  private buildInsertion({
    dataToWrite,
    lastBracketIndex,
    readPosition,
    fileTail,
    trimmedFileTail,
  }: {
    dataToWrite: unknown[];
    lastBracketIndex: number;
    readPosition: number;
    fileTail: string;
    trimmedFileTail: string;
  }) {
    const jsonString = removeFirstAndLastBrackets(
      JSON.stringify(dataToWrite, null, this.options.indent),
    );

    const shouldInsertComma = /[^\s[]\s*]$/.test(trimmedFileTail);
    const maybeNewLine = this.options.pretty ? "\n" : "";
    const maybeIndentation = this.options.pretty ? " ".repeat(this.options.indent) : "";

    const insertion = `${shouldInsertComma ? "," : ""}${maybeNewLine}${maybeIndentation}${jsonString}${maybeNewLine}]`;

    const truncatePosition =
      readPosition +
      lastBracketIndex -
      countNewLinesAndSpacesBeforeLastBracket({
        fileTail,
        lastBracketIndex,
        pretty: this.options.pretty,
      });

    return {
      insertion,
      truncatePosition,
    };
  }

  private async readFileTail(fileHandle: MinimalFileHandle) {
    const stats = await fileHandle.stat();
    const bufferSize = Math.min(stats.size, 50);
    const readPosition = stats.size - bufferSize;

    const buffer = Buffer.alloc(bufferSize);

    await fileHandle.read(buffer, 0, bufferSize, readPosition);

    const fileTail = buffer.toString();
    const lastBracketIndex = fileTail.lastIndexOf("]");
    const trimmedFileTail = fileTail.trim();

    return {
      fileTail,
      lastBracketIndex,
      trimmedFileTail,
      readPosition,
    };
  }

  private async ensureAllIsFlushed() {
    if (this.buffer.length === 0) {
      return;
    }

    let dataToWrite: unknown[] = [];
    let fileHandle: MinimalFileHandle | undefined;
    try {
      while (this.buffer.length > 0) {
        dataToWrite = this.buffer.splice(0, this.buffer.length);
        fileHandle = await this.options.fileOpen(
          this.filePath,
          this.options.initArray ? "a+" : "r+",
        );

        const { fileTail, lastBracketIndex, trimmedFileTail, readPosition } =
          await this.readFileTail(fileHandle);

        if (trimmedFileTail === "" && this.options.initArray) {
          await fileHandle.write(JSON.stringify(dataToWrite, null, this.options.indent));
          continue;
        }

        if (lastBracketIndex === -1) {
          throw new Error(
            "The file does not contain a valid JSON array. Please ensure the file contains a valid JSON array before appending data.",
          );
        }

        const { truncatePosition, insertion } = this.buildInsertion({
          dataToWrite,
          lastBracketIndex,
          readPosition,
          fileTail,
          trimmedFileTail,
        });

        await fileHandle.truncate(truncatePosition);
        await fileHandle.write(insertion, truncatePosition);
      }
    } catch (error) {
      this.buffer.unshift(...dataToWrite);
      throw error;
    } finally {
      await fileHandle?.close();
    }
  }

  /**
   * Writes the buffered entries to the file. A call made while a flush runs returns that flush.
   * With `shutdown`, later `append` calls drop their data. A failed flush keeps its entries
   * buffered.
   */
  async flush({ shutdown }: { shutdown?: boolean } = {}) {
    if (this.flushPromise) {
      if (shutdown) {
        this.isShutdown = true;
      }
      return this.flushPromise;
    }

    if (shutdown) {
      this.isShutdown = true;
    }

    this.flushPromise = this.ensureAllIsFlushed()
      .then(() => {
        this.flushPromise = undefined;
      })
      .catch((error) => {
        this.flushPromise = undefined;
        throw error;
      });

    return this.flushPromise;
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
