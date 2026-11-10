import { constants } from "node:fs";
import { describe, expect, test, vi } from "vitest";

import { InMemoryFileHandle } from "../tests/InMemoryFileHandle";
import { newJappendWriter } from "./jappend";

describe("Entry buffering", () => {
  test(`buffers entries and flushes them to the file when the buffer size is reached`, async () => {
    const inMemoryFileHandle = new InMemoryFileHandle({
      initialContent: JSON.stringify([{ test: [1] }], null, 2),
    });

    vi.spyOn(inMemoryFileHandle, "write");

    const jappendWriter = newJappendWriter("/file", {
      fileOpen: async () => inMemoryFileHandle,
      bufferFlushThreshold: 2,
    });

    await jappendWriter.append({ test: [2] });
    await jappendWriter.append({ test: [3] });

    expect(inMemoryFileHandle.content).toBe(
      JSON.stringify([{ test: [1] }, { test: [2] }, { test: [3] }], null, 2),
    );
    expect(inMemoryFileHandle.write).toHaveBeenCalledTimes(1);
  });

  test("flushes the buffer when the `flush` method is called", async () => {
    const inMemoryFileHandle = new InMemoryFileHandle({
      initialContent: JSON.stringify([{ test: [1] }], null, 2),
    });

    vi.spyOn(inMemoryFileHandle, "write");

    const jappendWriter = newJappendWriter("/file", {
      fileOpen: async () => inMemoryFileHandle,
      bufferFlushThreshold: Infinity,
    });

    await jappendWriter.append({ test: [2] });
    await jappendWriter.append({ test: [3] });

    expect(inMemoryFileHandle.write).toHaveBeenCalledTimes(0);

    await jappendWriter.flush();

    expect(inMemoryFileHandle.content).toBe(
      JSON.stringify([{ test: [1] }, { test: [2] }, { test: [3] }], null, 2),
    );
    expect(inMemoryFileHandle.write).toHaveBeenCalledTimes(1);
  });

  test("does not write if buffer is empty", async () => {
    const inMemoryFileHandle = new InMemoryFileHandle({
      initialContent: JSON.stringify([{ test: [1] }], null, 2),
    });

    vi.spyOn(inMemoryFileHandle, "write");

    const jappendWriter = newJappendWriter("/file", {
      fileOpen: async () => inMemoryFileHandle,
      bufferFlushThreshold: 2,
    });

    await jappendWriter.flush();

    expect(inMemoryFileHandle.write).toHaveBeenCalledTimes(0);
    expect(inMemoryFileHandle.content).toBe(JSON.stringify([{ test: [1] }], null, 2));
  });
});

describe("File handling", () => {
  test("creates a new file if it does not exist", async () => {
    const inMemoryFileHandle = new InMemoryFileHandle();
    const fileOpen = vi.fn(async () => inMemoryFileHandle);
    const jappendWriter = newJappendWriter("/file", {
      fileOpen,
    });

    await jappendWriter.append({ test: [1] });

    // Read-write without append mode, so a write lands at the position it names.
    expect(fileOpen).toHaveBeenCalledWith("/file", constants.O_RDWR | constants.O_CREAT);
  });

  test("does not create a new file if `initArray` is false", async () => {
    const inMemoryFileHandle = new InMemoryFileHandle({
      initialContent: "[]",
    });
    const fileOpen = vi.fn(async () => inMemoryFileHandle);
    const jappendWriter = newJappendWriter("/file", {
      fileOpen,
      initArray: false,
    });

    await jappendWriter.append({ test: [1] });

    const onlyOpenAndAppendMode = "r+";

    expect(fileOpen).toHaveBeenCalledWith("/file", onlyOpenAndAppendMode);
  });

  test("closes the file handle after writing", async () => {
    const inMemoryFileHandle = new InMemoryFileHandle();
    const fileOpen = vi.fn(async () => inMemoryFileHandle);
    const jappendWriter = newJappendWriter("/file", {
      fileOpen,
    });

    vi.spyOn(inMemoryFileHandle, "close");

    await jappendWriter.append({ test: [1] });

    expect(inMemoryFileHandle.close).toHaveBeenCalled();
  });

  test("closes the file on a failure", async () => {
    const inMemoryFileHandle = new InMemoryFileHandle({
      initialContent: "invalid json",
    });
    const fileOpen = vi.fn(async () => inMemoryFileHandle);
    const jappendWriter = newJappendWriter("/file", {
      fileOpen,
    });

    vi.spyOn(inMemoryFileHandle, "close");

    await expect(jappendWriter.append({ test: [1] })).rejects.toThrow(expect.any(Error));

    expect(inMemoryFileHandle.close).toHaveBeenCalled();
  });
});

describe("Options validation", () => {
  test("throws an error if `filePath` is an empty string", () => {
    expect(() => newJappendWriter(" ")).toThrow(
      'File path must be a non-empty string, but got " "',
    );
  });

  test("throws an error if `bufferFlushThreshold` is not a positive integer", () => {
    expect(() => newJappendWriter("/file", { bufferFlushThreshold: 0 })).toThrow(
      "Entry buffer size must be one of: positive integer, Infinity, or undefined, but got 0",
    );
    expect(() => newJappendWriter("/file", { bufferFlushThreshold: -1 })).toThrow(
      "Entry buffer size must be one of: positive integer, Infinity, or undefined, but got -1",
    );
    expect(() => newJappendWriter("/file", { bufferFlushThreshold: 1.5 })).toThrow(
      "Entry buffer size must be one of: positive integer, Infinity, or undefined, but got 1.5",
    );
  });

  test("throws an error if `indent` is not an integer that is equal or greater than 0", () => {
    expect(() => newJappendWriter("/file", { indent: -1 })).toThrow(
      "Indent must be one of: positive integer, 0, or undefined, but got -1",
    );
    expect(() => newJappendWriter("/file", { indent: 1.5 })).toThrow(
      "Indent must be one of: positive integer, 0, or undefined, but got 1.5",
    );
  });
});

describe("Error propagation", () => {
  test("propagates errors from writing fails", async () => {
    const inMemoryFileHandle = new InMemoryFileHandle();
    const jappendWriter = newJappendWriter("/file", {
      fileOpen: async () => inMemoryFileHandle,
    });

    vi.spyOn(inMemoryFileHandle, "write").mockImplementation(() => {
      throw new Error("Write error");
    });

    await expect(jappendWriter.append({ test: [1] })).rejects.toThrow(expect.any(Error));
  });
});

describe("Flushing", () => {
  test("flushes the buffer only once when multiple flush calls are made", async () => {
    const inMemoryFileHandle = new InMemoryFileHandle();
    const jappendWriter = newJappendWriter("/file", {
      fileOpen: async () => inMemoryFileHandle,
      bufferFlushThreshold: 5,
    });

    vi.spyOn(inMemoryFileHandle, "write");

    await jappendWriter.append({ test: [1] });
    await jappendWriter.append({ test: [2] });

    expect(inMemoryFileHandle.write).toHaveBeenCalledTimes(0);

    await Promise.all([jappendWriter.flush(), jappendWriter.flush()]);

    expect(inMemoryFileHandle.write).toHaveBeenCalledTimes(1);
    expect(inMemoryFileHandle.content).toBe(
      JSON.stringify([{ test: [1] }, { test: [2] }], null, 2),
    );
  });

  test("flushes new entries that were added during flushing", async () => {
    const inMemoryFileHandle = new InMemoryFileHandle({
      initialContent: JSON.stringify([{ test: [1] }], null, 2),
    });
    const jappendWriter = newJappendWriter("/file", {
      fileOpen: async () => inMemoryFileHandle,
      bufferFlushThreshold: 5,
    });

    await jappendWriter.append({ test: [2] });

    await Promise.all([jappendWriter.flush(), jappendWriter.append({ test: [3] })]);

    expect(inMemoryFileHandle.content).toBe(
      JSON.stringify([{ test: [1] }, { test: [2] }, { test: [3] }], null, 2),
    );
  });

  test("flushes new entries that were added during flushing when file is empty initially", async () => {
    const inMemoryFileHandle = new InMemoryFileHandle();
    const jappendWriter = newJappendWriter("/file", {
      fileOpen: async () => inMemoryFileHandle,
      bufferFlushThreshold: 5,
    });

    await jappendWriter.append({ test: [1] });

    await Promise.all([jappendWriter.flush(), jappendWriter.append({ test: [2] })]);

    expect(inMemoryFileHandle.content).toBe(
      JSON.stringify([{ test: [1] }, { test: [2] }], null, 2),
    );
  });

  test("opens the file once for entries appended while it writes, and closes it", async () => {
    const inMemoryFileHandle = new InMemoryFileHandle();
    const fileOpen = vi.fn(async () => inMemoryFileHandle);
    const jappendWriter = newJappendWriter("/file", { fileOpen, bufferFlushThreshold: 5 });
    const write = inMemoryFileHandle.write.bind(inMemoryFileHandle);

    vi.spyOn(inMemoryFileHandle, "close");
    vi.spyOn(inMemoryFileHandle, "write").mockImplementationOnce((async (
      bytes: Uint8Array,
      offset?: number | null,
      length?: number | null,
      position?: number | null,
    ) => {
      await jappendWriter.append({ test: [2] });
      return write(bytes, offset, length, position);
    }) as typeof inMemoryFileHandle.write);

    await jappendWriter.append({ test: [1] });
    await jappendWriter.flush();

    expect(inMemoryFileHandle.content).toBe(
      JSON.stringify([{ test: [1] }, { test: [2] }], null, 2),
    );
    expect(fileOpen).toHaveBeenCalledTimes(1);
    expect(inMemoryFileHandle.close).toHaveBeenCalledTimes(1);
  });

  test("writes an entry appended while the file closes in the same flush", async () => {
    const inMemoryFileHandle = new InMemoryFileHandle();
    const fileOpen = vi.fn(async () => inMemoryFileHandle);
    const jappendWriter = newJappendWriter("/file", { fileOpen, bufferFlushThreshold: 5 });

    vi.spyOn(inMemoryFileHandle, "close").mockImplementationOnce(async () => {
      await jappendWriter.append({ test: [2] });
    });

    await jappendWriter.append({ test: [1] });
    await jappendWriter.flush();

    expect(inMemoryFileHandle.content).toBe(
      JSON.stringify([{ test: [1] }, { test: [2] }], null, 2),
    );
    expect(fileOpen).toHaveBeenCalledTimes(2);
    expect(inMemoryFileHandle.close).toHaveBeenCalledTimes(2);
  });

  test("puts back only the failed batch when a later pass on the same file fails", async () => {
    const inMemoryFileHandle = new InMemoryFileHandle();
    const jappendWriter = newJappendWriter("/file", {
      fileOpen: async () => inMemoryFileHandle,
      bufferFlushThreshold: 5,
    });
    const write = inMemoryFileHandle.write.bind(inMemoryFileHandle);
    const stat = inMemoryFileHandle.stat.bind(inMemoryFileHandle);

    vi.spyOn(inMemoryFileHandle, "close");
    vi.spyOn(inMemoryFileHandle, "write").mockImplementationOnce((async (
      bytes: Uint8Array,
      offset?: number | null,
      length?: number | null,
      position?: number | null,
    ) => {
      await jappendWriter.append({ test: [2] });
      return write(bytes, offset, length, position);
    }) as typeof inMemoryFileHandle.write);
    vi.spyOn(inMemoryFileHandle, "stat")
      .mockImplementationOnce((() => stat()) as typeof inMemoryFileHandle.stat)
      .mockRejectedValueOnce(new Error("Stat error"));

    await jappendWriter.append({ test: [1] });

    await expect(jappendWriter.flush()).rejects.toThrow("Stat error");
    expect(inMemoryFileHandle.content).toBe(JSON.stringify([{ test: [1] }], null, 2));
    expect(inMemoryFileHandle.close).toHaveBeenCalledTimes(1);

    await jappendWriter.flush();

    expect(inMemoryFileHandle.content).toBe(
      JSON.stringify([{ test: [1] }, { test: [2] }], null, 2),
    );
  });

  test("keeps the file a valid array when a write fails, and the next flush writes correctly", async () => {
    const inMemoryFileHandle = new InMemoryFileHandle({
      initialContent: JSON.stringify([{ test: [1] }], null, 2),
    });
    const jappendWriter = newJappendWriter("/file", {
      fileOpen: async () => inMemoryFileHandle,
      bufferFlushThreshold: 5,
    });

    vi.spyOn(inMemoryFileHandle, "write").mockRejectedValueOnce(new Error("Write error"));

    await jappendWriter.append({ test: [2] });

    await expect(jappendWriter.flush()).rejects.toThrow("Write error");
    expect(JSON.parse(inMemoryFileHandle.content)).toEqual([{ test: [1] }]);

    await jappendWriter.flush();

    expect(inMemoryFileHandle.content).toBe(
      JSON.stringify([{ test: [1] }, { test: [2] }], null, 2),
    );
  });

  test("pads the entries to cover a closing tail longer than they are", async () => {
    const initialContent = "[\n  1" + " ".repeat(40) + "\n]";
    const inMemoryFileHandle = new InMemoryFileHandle({ initialContent });
    const jappendWriter = newJappendWriter("/file", { fileOpen: async () => inMemoryFileHandle });

    await jappendWriter.append(2);

    expect(JSON.parse(inMemoryFileHandle.content)).toEqual([1, 2]);
    expect(inMemoryFileHandle.content).toHaveLength(initialContent.length);
  });

  test("writes the bytes of entries with non-ASCII text", async () => {
    const inMemoryFileHandle = new InMemoryFileHandle({
      initialContent: "[\n  1" + " ".repeat(40) + "\n]",
    });
    const jappendWriter = newJappendWriter("/file", { fileOpen: async () => inMemoryFileHandle });

    await jappendWriter.append("ääää");
    await jappendWriter.append("ü€😀");

    expect(JSON.parse(inMemoryFileHandle.content)).toEqual([1, "ääää", "ü€😀"]);
  });

  test("writes the rest of the entries after a short write", async () => {
    const inMemoryFileHandle = new InMemoryFileHandle({
      initialContent: JSON.stringify([{ test: [1] }], null, 2),
    });
    const jappendWriter = newJappendWriter("/file", { fileOpen: async () => inMemoryFileHandle });
    const write = inMemoryFileHandle.write.bind(inMemoryFileHandle);

    vi.spyOn(inMemoryFileHandle, "write").mockImplementationOnce(((
      bytes: Uint8Array,
      offset?: number | null,
      length?: number | null,
      position?: number | null,
    ) =>
      write(
        bytes,
        offset,
        Math.min(Number(length), 3),
        position,
      )) as typeof inMemoryFileHandle.write);

    await jappendWriter.append({ test: [2] });

    expect(inMemoryFileHandle.content).toBe(
      JSON.stringify([{ test: [1] }, { test: [2] }], null, 2),
    );
  });

  test("data is not lost if an error occurs during flushing", async () => {
    const inMemoryFileHandle = new InMemoryFileHandle();
    const jappendWriter = newJappendWriter("/file", {
      fileOpen: async () => inMemoryFileHandle,
      bufferFlushThreshold: 5,
    });

    vi.spyOn(inMemoryFileHandle, "write").mockRejectedValueOnce(new Error("Write error"));

    jappendWriter.append({ test: [1] });

    await expect(jappendWriter.flush()).rejects.toThrow("Write error");

    await jappendWriter.flush();

    expect(inMemoryFileHandle.content).toBe(JSON.stringify([{ test: [1] }], null, 2));
  });

  describe("Shutdown", () => {
    test("stops accepting new entries after shutdown", async () => {
      const inMemoryFileHandle = new InMemoryFileHandle();
      const jappendWriter = newJappendWriter("/file", {
        fileOpen: async () => inMemoryFileHandle,
        bufferFlushThreshold: 5,
      });

      await jappendWriter.append({ test: [1] });
      await jappendWriter.append({ test: [2] });

      await Promise.all([
        jappendWriter.flush({
          shutdown: true,
        }),
        jappendWriter.append({
          test: [3],
        }),
      ]);

      expect(inMemoryFileHandle.content).toBe(
        JSON.stringify([{ test: [1] }, { test: [2] }], null, 2),
      );
    });

    test("shutdown is applied even if flushing is in progress", async () => {
      const inMemoryFileHandle = new InMemoryFileHandle();
      const jappendWriter = newJappendWriter("/file", {
        fileOpen: async () => inMemoryFileHandle,
        bufferFlushThreshold: 5,
      });

      await jappendWriter.append({ test: [1] });

      await Promise.all([
        jappendWriter.flush(),
        jappendWriter.flush({
          shutdown: true,
        }),
      ]);

      await jappendWriter.append({ test: [2] });

      await jappendWriter.flush();

      expect(inMemoryFileHandle.content).toBe(JSON.stringify([{ test: [1] }], null, 2));
    });
  });
});

describe("Fire-and-forget", () => {
  test("allows appending without awaiting each call", async () => {
    const inMemoryFileHandle = new InMemoryFileHandle();
    const jappendWriter = newJappendWriter("/file", {
      fileOpen: async () => inMemoryFileHandle,
      bufferFlushThreshold: 2,
      suppressThresholdFlushErrors: true,
    });

    jappendWriter.append({ test: [1] });
    jappendWriter.append({ test: [2] });

    await jappendWriter.flush();

    expect(inMemoryFileHandle.content).toBe(
      JSON.stringify([{ test: [1] }, { test: [2] }], null, 2),
    );
  });

  test("suppresses append errors in fire-and-forget mode", async () => {
    const inMemoryFileHandle = new InMemoryFileHandle();
    const logger = {
      error: vi.fn(),
    };
    const jappendWriter = newJappendWriter("/file", {
      fileOpen: async () => inMemoryFileHandle,
      bufferFlushThreshold: 2,
      suppressThresholdFlushErrors: true,
      logger,
    });

    vi.spyOn(inMemoryFileHandle, "write").mockRejectedValueOnce(new Error("Write error"));

    jappendWriter.append({ test: [1] });
    await jappendWriter.append({ test: [2] });

    expect(inMemoryFileHandle.write).toHaveBeenCalledTimes(1);
    expect(inMemoryFileHandle.content).toBe("");

    await jappendWriter.flush();

    expect(inMemoryFileHandle.content).toBe(
      JSON.stringify([{ test: [1] }, { test: [2] }], null, 2),
    );
    expect(logger.error).toHaveBeenCalledWith(
      "Error flushing buffer on threshold: Error: Write error",
    );
  });
});
