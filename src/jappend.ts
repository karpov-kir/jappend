import type { Mode, PathLike } from "fs";

import { JappendWriter, type MinimalFileHandle, type WriterOptions } from "./JappendWriter";

/**
 * Options for appending data to a JSON file.
 * @typedef {Object} JappendOptions.
 * @property {boolean} [pretty=true] - Whether to format the JSON with indentation.
 * @property {boolean} [initArray=true] - Whether to initialize the file with an empty array if the file is empty or does not exist.
 * @property {number} [indent=2] - The number of spaces to use for indentation if `pretty` is `true`.
 * @property {function} [fileOpen=fs.open] - A function to open the file, defaults to {@link WriterOptions.fileOpen}.
 */
export interface JappendOptions {
  pretty?: boolean;
  initArray?: boolean;
  indent?: number;
  fileOpen?: (path: PathLike, flags?: string | number, mode?: Mode) => Promise<MinimalFileHandle>;
}

/**
 * @param filePath - The path to the JSON file.
 * @param newData - The data to append to the JSON file.
 * @param options - {@link JappendOptions} for appending data to the JSON file
 * @returns {Promise<void>} A promise that resolves when the data has been appended to the file.
 */
export async function jappend(
  filePath: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  newData: any,
  options: JappendOptions = {},
): Promise<void> {
  const jappendWriter = new JappendWriter(filePath, {
    ...options,
    bufferFlushThreshold: 1,
  });

  await jappendWriter.append(newData);
}

/**
 *
 * @param filePath - The path to the JSON file.
 * @param options - {@link WriterOptions} for the jappendWriter.
 * @returns - A new instance of {@link JappendWriter} (supports buffering) that can be used to append data to the JSON file.
 */
export function newJappendWriter(filePath: string, options: WriterOptions = {}): JappendWriter {
  return new JappendWriter(filePath, options);
}
