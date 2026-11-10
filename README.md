# `jappend`

A memory-efficient Node.js library for appending entries to large JSON array files without ever loading the entire file into memory.

[![CI](https://github.com/karpov-kir/jappend/actions/workflows/ci.yml/badge.svg)](https://github.com/karpov-kir/jappend/actions/workflows/ci.yml)
[![MIT License](https://img.shields.io/badge/license-MIT-brightgreen.svg)](https://opensource.org/licenses/MIT)
[![npm version](https://img.shields.io/npm/v/jappend)](https://www.npmjs.com/package/jappend)
[![npm dm](https://img.shields.io/npm/dm/jappend.svg)](https://www.npmjs.com/package/jappend)
[![npm dt](https://img.shields.io/npm/dt/jappend.svg)](https://www.npmjs.com/package/jappend)

## 🚀 Features

- **Memory efficient**: appends to a large JSON file and reads only its end
- **Buffered writing**: writes many entries in one batch
- **Pretty formatting**: indented or compact JSON
- **Typed**: ships TypeScript declarations

## 📦 Installation

```bash
npm install jappend
```

## 🔧 Usage

### Basic Usage

```typescript
import { jappend } from "jappend";

// Append one entry to a JSON array file
await jappend("data.json", { id: 1, name: "John" });
await jappend("data.json", { id: 2, name: "Jane" });
```

### Buffered Writing (Recommended for Multiple Entries)

To write many entries, use a `JappendWriter`, which buffers them and writes them in batches:

```typescript
import { newJappendWriter } from "jappend";

const jappendWriter = newJappendWriter("data.json", {
  bufferFlushThreshold: 1000, // Buffer up to 1000 entries before writing
});

for (let i = 0; i < 10100; i++) {
  await jappendWriter.append({ id: i, timestamp: Date.now() });
}

// Flush any remaining buffered entries and stop accepting new entries
await jappendWriter.flush({ shutdown: true });
```

### Fire-and-Forget Mode (Suppressing Automatic Buffer Flush Errors)

To leave `append` calls unawaited, set `suppressThresholdFlushErrors: true`. A flush that `append` starts on reaching the threshold then logs its error to `logger` instead of rejecting, and keeps the entries buffered for the next flush. A `flush` call still rejects on error.

```typescript
import { newJappendWriter } from "jappend";

const writer = newJappendWriter("data.json", {
  bufferFlushThreshold: 1000,
  suppressThresholdFlushErrors: true, // Enable fire-and-forget
});

eventEmitter.on("some-event", (data) => {
  writer.append({ data, timestamp: Date.now() });
});

// Flush the remaining entries and handle the error
function shutdown() {
  writer
    .flush({ shutdown: true })
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error("Failed to flush data:", error);
      process.exit(1);
    });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
```

### Configuration Options

```typescript
import { jappend, newJappendWriter } from "jappend";

await jappend(
  "data.json",
  { test: "data" },
  {
    pretty: true, // Format with indentation (default: true)
    indent: 4, // Spaces for indentation (default: 2)
    initArray: true, // Create a missing file and start an empty one with an array (default: true)
  },
);

const jappendWriter = newJappendWriter("data.json", {
  bufferFlushThreshold: 5000, // Entries that make append flush (default: 1)
  pretty: false, // Compact JSON, indent is ignored (default: true)
  initArray: true, // Create a missing file and start an empty one with an array (default: true)
  suppressThresholdFlushErrors: false, // append rejects on a threshold flush error (default: false)
});
```

## 🛠️ API Reference

### `jappend(filePath, data, options?)`

Appends one entry to a JSON array file. Each call opens and closes the file.

**Parameters:**

- `filePath` (string): path to the JSON file
- `data` (any): data to append (must be JSON-serializable)
- `options` (`JappendOptions`, optional): configuration options

#### `JappendOptions`

- `pretty` (boolean, default: `true`): format JSON with indentation for human readability
- `indent` (number, default: `2`): number of spaces for indentation when `pretty` is `true`
- `initArray` (boolean, default: `true`): create a missing file and start an empty file with the array. With `false`, an append to a missing or empty file fails.
- `fileOpen` (function, default: `fs.open`): opens the file and returns a `MinimalFileHandle`, such as an `InMemoryFileHandle` in a test. With `initArray` it gets the flags `O_RDWR | O_CREAT`, otherwise `r+`. The writer writes at positions, so the handle must not be in append mode.

### `newJappendWriter(filePath, options?)`

Returns a `JappendWriter`, which buffers entries and writes them in batches. Throws when `filePath` is blank or an option is out of range.

**Parameters:**

- `filePath` (string): path to the JSON file
- `options` (`WriterOptions`, optional): configuration options

#### `WriterOptions`

- `bufferFlushThreshold` (positive integer or `Infinity`, default: `1`): the buffered entry count that makes `append` flush. A running flush also writes the entries appended while it runs.
- `pretty` (boolean, default: `true`): format JSON with indentation for human readability
- `indent` (number, default: `2`): number of spaces for indentation when `pretty` is `true`
- `initArray` (boolean, default: `true`): create a missing file and start an empty file with the array. With `false`, a flush to a missing or empty file fails.
- `fileOpen` (function, default: `fs.open`): opens the file and returns a `MinimalFileHandle`, such as an `InMemoryFileHandle` in a test. With `initArray` it gets the flags `O_RDWR | O_CREAT`, otherwise `r+`. The writer writes at positions, so the handle must not be in append mode.
- `suppressThresholdFlushErrors` (boolean, default: `false`): with `true`, a flush that `append` starts on reaching the threshold logs its error to `logger` instead of rejecting (fire-and-forget mode). `flush` still rejects.
- `logger` (object with an `error(message)` method, default: `console.error`): receives the errors that `suppressThresholdFlushErrors` keeps from `append`

### `JappendWriter` Class Methods

#### `append(data: any): Promise<void>`

Adds data to the buffer and flushes when the buffer reaches `bufferFlushThreshold`. After `flush({ shutdown: true })`, `append` drops the data.

#### `flush(options?: { shutdown?: boolean }): Promise<void>`

Writes all buffered entries to the file. A call made while a flush runs returns that flush. With `shutdown: true` (default `false`), later `append` calls drop their data. A failed flush keeps its entries buffered, so the next flush retries them. The flush writes the entries over the closing bracket and never cuts the file, so a write that fails without writing anything leaves the array valid.

## 🎯 Use Cases

### Logging System

```typescript
const logger = newJappendWriter("logs.json", {
  bufferFlushThreshold: 100,
  suppressThresholdFlushErrors: true, // Enable fire-and-forget behavior
});

// Somewhere in your application
logger.append({
  level: "info",
  message: "User logged in",
  timestamp: new Date().toISOString(),
  userId: 123,
});

function shutdown() {
  logger
    .flush({ shutdown: true })
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error("Failed to flush logs:", error);
      process.exit(1);
    });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
```

### Data Collection

```typescript
// Collect sensor data
const dataCollector = newJappendWriter("sensor-data.json", {
  bufferFlushThreshold: 1000,
  pretty: false, // Compact format for space efficiency
});

// Somewhere in your data collection loop
await dataCollector.append({
  sensorId: "temp-01",
  value: 23.5,
  timestamp: Date.now(),
});

function shutdown() {
  dataCollector
    .flush({ shutdown: true })
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error("Failed to flush sensor data:", error);
      process.exit(1);
    });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
```

### Streaming Analytics

```typescript
import { newJappendWriter } from "jappend";
import type { JappendWriter } from "jappend/dist/JappendWriter.js";
import { type TransformCallback, Writable } from "stream";

class AnalyticsWriterStream extends Writable {
  private readonly writer: JappendWriter;

  constructor(writer: JappendWriter) {
    super({ objectMode: true });
    this.writer = writer;
  }

  override _write(
    event: { type: string; userId: string; timestamp: string; metadata: string },
    encoding: BufferEncoding,
    done: TransformCallback,
  ) {
    this.writer
      .append(event)
      .then(() => done())
      .catch((error) => done(new Error(`Failed to write event: ${error.message}`)));
  }
}

const analytics = newJappendWriter("events.json", {
  bufferFlushThreshold: 5000,
});
const analyticsStream = new AnalyticsWriterStream(analytics);

someStream.pipe(analyticsStream).on("finish", async () => {
  try {
    await analytics.flush({ shutdown: true });
  } catch (error) {
    console.error("Failed to flush analytics data:", error);
  }
});
```

## 🧪 Development

### Setup

```bash
mise run setup
```

### Testing

```bash
# Run the linters, the build and every test, as before a commit
mise run check

# Run unit and integration tests
bun run test

# Run unit tests
bun run test:unit

# Run unit tests in watch mode
bun run test:watch

# Run integration tests
bun run test:integration

# Run performance benchmarks
bun run benchmark
```

### Testing Your Code

The package ships an `InMemoryFileHandle` class for tests. It implements `MinimalFileHandle`, the subset of the Node.js `FileHandle` methods that `jappend` calls, and keeps the file content in memory. It writes only strings and reads only into a `Buffer`.

```typescript
import { jappend } from "jappend";
import { InMemoryFileHandle } from "jappend/dist/tests/InMemoryFileHandle.js";

const inMemoryFileHandle = new InMemoryFileHandle({
  initialContent: JSON.stringify([{ existing: "data" }], null, 2),
});

await jappend(
  "/test-file",
  { new: "entry" },
  {
    fileOpen: async () => inMemoryFileHandle,
  },
);

console.log(inMemoryFileHandle.content);
```

### Building

```bash
bun run build
```

## 📊 Performance

Benchmark results for writing 50,000 entries to a file that already holds 200,000 entries. Memory usage is the change in heap use:

| Method                            | Time    | Memory Usage | Description                                       |
| --------------------------------- | ------- | ------------ | ------------------------------------------------- |
| `JSON.stringify` (traditional)    | 2037ms  | 4528MB       | Load entire file, parse, modify, stringify        |
| `JappendWriter` (buffered)        | 637ms   | 256MB        | Buffered writes (10,000 entries)                  |
| `JappendWriter` (infinite buffer) | 657ms   | 870MB        | Single flush at the end                           |
| `JappendWriter` (fire-and-forget) | 695ms   | 756MB        | Buffered writes (10,000 entries), fire-and-forget |
| `jappend` (unbuffered)            | 12381ms | 11MB         | Write each entry individually                     |

Buffered writing gives the best balance of speed and memory. A flush reads only the end of the file, so memory use does not grow with the file size.

Run the benchmarks:

```bash
bun run benchmark
```

`bun ./benchmark.ts <type>` runs one of them: `default`, `library`, `buffer`, `infinite-buffer` or `fire-and-forget`. The memory figures vary from run to run, so run a benchmark several times.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
