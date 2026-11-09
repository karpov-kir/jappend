import { Readable, type ReadableOptions } from "stream";

export class FakeReadableStream extends Readable {
  constructor(options?: ReadableOptions) {
    super(options);
  }

  override _read(_size: number): void {}

  readMore(data: unknown = "test") {
    setImmediate(() => {
      this.push(data);
    });
  }

  finish() {
    setImmediate(() => {
      this.push(null);
    });
  }

  finishWithError(error: Error) {
    setImmediate(() => {
      this.emit("error", error);
    });
  }
}
