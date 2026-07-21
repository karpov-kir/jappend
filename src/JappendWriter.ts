import type { Mode, PathLike } from 'fs';
import type { FileHandle } from 'fs/promises';
import fs from 'fs/promises';

import { countNewLinesAndSpacesBeforeLastBracket, removeFirstAndLastBrackets } from './utils';

/**
 * A minimal interface for a file handle that supports basic file operations.
 * Subset of {@link fs.FileHandle} that includes only the methods needed for appending data to a JSON file.
 * @typedef {Object} MinimalFileHandle
 * @property {function} read - Reads data from the file
 * @property {function} write - Writes data to the file
 * @property {function} close - Closes the file handle
 * @property {function} truncate - Truncates the file to a specified length
 * @property {function} stat - Gets the file statistics
 */
export type MinimalFileHandle = Pick<FileHandle, 'read' | 'write' | 'close' | 'truncate' | 'stat'>;

/**
 * Options for the {@link JappendWriter} class.
 * @typedef {Object} WriterOptions
 * @property {number} [bufferFlushThreshold=1] - The maximum number of entries to buffer before flushing to the file.
 * If the buffer is exceeded and new data comes in during the flush it is still buffered and will be eventually flushed.
 * @property {function} fileOpen - A function to open the file and returns {@link MinimalFileHandle}, defaults to {@link fs.open}.
 * @property {boolean} [pretty=true] - Whether to format the JSON with indentation.
 * @property {number} [indent=2] - The number of spaces to use for indentation if `pretty` is `true`.
 * @property {boolean} [initArray=true] - Whether to initialize the file with an empty array if the file is empty or does not exist.
 * @property {boolean} [suppressThresholdFlushErrors=false] - if `true`, errors thrown during automatic flushes triggered by the buffer threshold writes
 * are suppressed and logged instead of thrown (enables fire-and-forget pattern). Calling `flush` will still throw errors.
 * @property {Object} [logger] - Custom logger for error reporting. Should have an `error` method. Defaults to `console.error`.
 */
export interface WriterOptions {
  bufferFlushThreshold?: number;
  fileOpen?: (path: PathLike, flags?: string | number, mode?: Mode) => Promise<MinimalFileHandle>;
  pretty?: boolean;
  indent?: number;
  initArray?: boolean;
  suppressThresholdFlushErrors?: boolean;
  logger?: {
    /**
     * Called when an error occurs during a threshold-triggered flush if `suppressThresholdFlushErrors` is `true`.
     * @param {string} message - The error message to log.
     */
    error: (message: string) => void;
  };
}

/**
 * A class that manages the buffering and flushing of data to a JSON file.
 * It allows appending data to a JSON array in a file, ensuring that the file
 * remains a valid JSON array format.
 *
 * @class JappendWriter
 * @param {string} filePath - The path to the JSON file.
 * @param {WriterOptions} options - The options for the jappendWriter.
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
    const jsonString = removeFirstAndLastBrackets(JSON.stringify(dataToWrite, null, this.options.indent));

    const shouldInsertComma = /[^\s[]\s*]$/.test(trimmedFileTail);
    const maybeNewLine = this.options.pretty ? '\n' : '';
    const maybeIndentation = this.options.pretty ? ' '.repeat(this.options.indent) : '';

    const insertion = `${shouldInsertComma ? ',' : ''}${maybeNewLine}${maybeIndentation}${jsonString}${maybeNewLine}]`;

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
    const lastBracketIndex = fileTail.lastIndexOf(']');
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
        fileHandle = await this.options.fileOpen(this.filePath, this.options.initArray ? 'a+' : 'r+');

        const { fileTail, lastBracketIndex, trimmedFileTail, readPosition } = await this.readFileTail(fileHandle);

        if (trimmedFileTail === '' && this.options.initArray) {
          await fileHandle.write(JSON.stringify(dataToWrite, null, this.options.indent));
          continue;
        }

        if (lastBracketIndex === -1) {
          throw new Error(
            'The file does not contain a valid JSON array. Please ensure the file contains a valid JSON array before appending data.',
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
   * Flushes the buffered data to the file.
   * If `shutdown` is `true`, it will stop accepting new data and flush the buffer.
   * Safe to call multiple times, it will only flush once.
   * @param {Object} options - Options for flushing.
   * @param {boolean} [options.shutdown=false] - Whether stop accepting new data.
   * @returns {Promise<void>} A promise that resolves when the flush is complete.
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
    const isBufferFlushThresholdInfinity = options.bufferFlushThreshold === Number.POSITIVE_INFINITY;

    const isValid =
      (isBufferFlushThresholdOneOrGreater && isBufferFlushThresholdInteger) || isBufferFlushThresholdInfinity;

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
      throw new Error(`Indent must be one of: positive integer, 0, or undefined, but got ${options.indent}`);
    }
  }
}
