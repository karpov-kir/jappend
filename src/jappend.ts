import type { Mode, PathLike } from "node:fs";

import { JappendWriter, type MinimalFileHandle, type WriterOptions } from "./JappendWriter.js";

export interface JappendOptions {
  /** Formats the JSON with newlines and `indent` spaces. Defaults to `true`. */
  pretty?: boolean;
  /**
   * Creates a missing file and starts the array in an empty file. Defaults to `true`. With `false`,
   * an append to a missing or empty file fails.
   */
  initArray?: boolean;
  /** Sets the spaces per indent level when `pretty` is `true`. Defaults to `2`. */
  indent?: number;
  /**
   * Opens the file. Defaults to `fs.open`. A test can return an `InMemoryFileHandle` instead. Must
   * not open the file in append mode: the writer writes at positions, which Linux ignores there.
   */
  fileOpen?: (path: PathLike, flags?: string | number, mode?: Mode) => Promise<MinimalFileHandle>;
}

/**
 * Appends `newData` as one entry to the JSON array in `filePath`. Each call opens and closes the
 * file, so {@link newJappendWriter} is faster for many entries.
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
 * Returns a {@link JappendWriter} that buffers entries for `filePath` and writes them in batches.
 * Throws when `filePath` is blank or an option is out of range.
 */
export function newJappendWriter(filePath: string, options: WriterOptions = {}): JappendWriter {
  return new JappendWriter(filePath, options);
}
