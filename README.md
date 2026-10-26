# `jappend`

A memory-efficient Node.js library for appending entries to large JSON array files without ever loading the entire file into memory.

[![CI](https://github.com/karpov-kir/jappend/actions/workflows/ci.yml/badge.svg)](https://github.com/karpov-kir/jappend/actions/workflows/ci.yml)
[![MIT License](https://img.shields.io/badge/license-MIT-brightgreen.svg)](LICENSE)
[![npm version](https://img.shields.io/npm/v/jappend)](https://www.npmjs.com/package/jappend)
[![npm dm](https://img.shields.io/npm/dm/jappend.svg)](https://www.npmjs.com/package/jappend)
[![npm dt](https://img.shields.io/npm/dt/jappend.svg)](https://www.npmjs.com/package/jappend)

## 🚀 Features

- **Memory efficient**: Append to large JSON files without loading them entirely into memory
- **Buffered writing**: Optional buffering for improved performance when writing multiple entries
- **Pretty formatting**: Configurable JSON formatting with custom indentation
- **Type safe**: Full TypeScript support with comprehensive type definitions
- **Flexible**: Works with any JSON-serializable data

## 📦 Installation

```bash
npm install jappend
```

## 🔧 Usage

### Basic Usage

```typescript
import { jappend } from 'jappend';

// Append a single object to a JSON array file
await jappend('data.json', { id: 1, name: 'John' });
await jappend('data.json', { id: 2, name: 'Jane' });
```

### Buffered Writing (Recommended for Multiple Entries)

For better performance when writing multiple entries, use the `JappendWriter` class with buffering:

```typescript
import { newJappendWriter } from 'jappend';

const jappendWriter = newJappendWriter('data.json', {
  bufferFlushThreshold: 1000, // Buffer up to 1000 entries before writing
});

// Add multiple entries
for (let i = 0; i < 10100; i++) {
  await jappendWriter.append({ id: i, timestamp: Date.now() });
}

// Flush any remaining buffered entries and stop accepting new entries
await jappendWriter.flush({ shutdown: true });
```

### Fire-and-Forget Mode (Suppressing Automatic Buffer Flush Errors)

For scenarios where you do not want to await every `append` call, you can enable fire-and-forget mode by setting `suppressThresholdFlushErrors: true`. This will suppress and log errors that occur during automatic buffer flushes (when the buffer threshold is reached). Note that errors will still be thrown if you explicitly call `flush`.

```typescript
import { newJappendWriter } from 'jappend';

const writer = newJappendWriter('data.json', {
  bufferFlushThreshold: 1000,
  suppressThresholdFlushErrors: true, // Enable fire-and-forget
});

// Some event emitter that generates data relatively often
eventEmitter.on('some-event', (data) => {
  // Append data without awaiting
  writer.append({ data, timestamp: Date.now() })
});

// At the end, flush any remaining entries and handle errors
function shutdown() {
  writer.flush({ shutdown: true })
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('Failed to flush sensor data:', error);
      process.exit(1);
    });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
```

### Configuration Options

```typescript
import { jappend, newJappendWriter } from 'jappend';

// Basic function with options
await jappend('data.json', { test: 'data' }, {
  pretty: true,    // Format with indentation (default: true)
  indent: 4,       // Spaces for indentation (default: 2)
  initArray: true, // Initialize empty file with [] (default: true)
});

// JappendWriter with advanced options
const jappendWriter = newJappendWriter('data.json', {
  bufferFlushThreshold: 5000, // Buffer write threshold (default: 1)
  pretty: false,              // Compact JSON
  initArray: true,            // Initialize empty file with [] (default: true)
  indent: 4,                  // Spaces for indentation (default: 2)
});
```

## 🛠️ API Reference

### `jappend(filePath, data, options?)`

Appends a single object to a JSON array file.

**Parameters:**
- `filePath` (string): path to the JSON file
- `data` (any): data to append (must be JSON-serializable)
- `options` (`JappendOptions`, optional): configuration options

#### `JappendOptions`
- `pretty` (boolean, default: `true`): format JSON with indentation for human readability
- `indent` (number, default: `2`): number of spaces for indentation when `pretty` is `true`
- `initArray` (boolean, default: `true`): automatically initialize empty file with `[]` array
- `fileOpen` (function, optional): custom file opener for simplified testing (defaults to `fs.open`)

### `newJappendWriter(filePath, options?)`

Creates a new `JappendWriter` instance for buffered operations.

**Parameters:**
- `filePath` (string): path to the JSON file
- `options` (`WriterOptions`, optional): configuration options

#### `WriterOptions`
- `bufferFlushThreshold` (number, default: `1`): maximum number of entries to buffer before automatically flushing to file.
  If the buffer is exceeded and new data comes in during the flush it is still buffered and will be eventually flushed.
- `pretty` (boolean, default: `true`): format JSON with indentation for human readability
- `indent` (number, default: `2`): number of spaces for indentation when `pretty` is `true`
- `initArray` (boolean, default: `true`): automatically initialize empty file with `[]` array
- `fileOpen` (function, optional): custom file opener for simplified testing (defaults to `fs.open`)
- `suppressThresholdFlushErrors` (boolean, default: `false`): if `true`, errors thrown during automatic flushes triggered by the buffer threshold writes
  are suppressed and logged instead of thrown (enables fire-and-forget pattern). Calling `flush` will still throw errors.
- `logger` (object, optional): custom logger with an `error` method for error reporting (defaults to `console.error`)

### `JappendWriter` Class Methods

#### `append(data: any): Promise<void>`

Adds data to the buffer. Automatically flushes when the buffer is full.

#### `flush(options?: { shutdown: boolean }): Promise<void>`

Manually flushes all buffered entries to the file. If `shutdown` is `true` (default is `false`), it stops accepting new entries.
Safe to call multiple times, it will only flush once.

## 🎯 Use Case Ideas (from GPT)

### Logging System

```typescript
const logger = newJappendWriter('logs.json', { 
  bufferFlushThreshold: 100,
  suppressThresholdFlushErrors: true // Enable fire-and-forget behavior
});

// Somewhere in your application
logger.append({
  level: 'info',
  message: 'User logged in',
  timestamp: new Date().toISOString(),
  userId: 123
});

function shutdown() {
  logger.flush({ shutdown: true })
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('Failed to flush sensor data:', error);
      process.exit(1);
    });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
```

### Data Collection

```typescript
// Collect sensor data
const dataCollector = newJappendWriter('sensor-data.json', {
  bufferFlushThreshold: 1000,
  pretty: false // Compact format for space efficiency
});

// Somewhere in your data collection loop
await dataCollector.append({
  sensorId: 'temp-01',
  value: 23.5,
  timestamp: Date.now()
});

function shutdown() {
  dataCollector.flush({ shutdown: true })
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('Failed to flush sensor data:', error);
      process.exit(1);
    });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
```

### Streaming Analytics

```typescript
import { newJappendWriter } from 'jappend';
import { JappendWriter } from 'jappend/dist/JappendWriter';
import { type TransformCallback, Writable } from 'stream';

class AnalyticsWriterStream extends Writable {
  private readonly writer: JappendWriter;

  constructor(writer: JappendWriter) {
    super({ objectMode: true });
    this.writer = writer;
  }

  override _write(
    event: { type: string; userId: string; timestamp: string; metadata: string },
    encoding: BufferEncoding,
    done: TransformCallback
  ) {
    this.writer
      .append(event)
      .then(() => done())
      .catch((error) => done(new Error(`Failed to write event: ${error.message}`)));
  }
}

const analytics = newJappendWriter('events.json', {
  bufferFlushThreshold: 5000,
});
const analyticsStream = new AnalyticsWriterStream(analytics);

someStream.pipe(analyticsStream).on('finish', async () => {
  try {
    await analytics.flush({ shutdown: true });
  } catch (error) {
    console.error('Failed to flush analytics data:', error);
  }
});
```

## 🧪 Development

### Setup

```bash
bun install
```

### Testing

```bash
# Run unit tests
bun test

# Run unit tests in watch mode
bun run test:watch

# Run integration tests
bun run test:integration

# Run unit and integration tests
bun run test:all

# Run performance benchmarks
bun run benchmark
```

### Testing Your Code

The library provides an `InMemoryFileHandle` class for testing purposes, which implements the `MinimalFileHandle` interface (a subset of Node.js file handle methods) and operates entirely in memory:

```typescript
import { jappend } from 'jappend';
import { InMemoryFileHandle } from 'jappend/dist/tests/InMemoryFileHandle';

// Create an in-memory file handle for testing
const inMemoryFileHandle = new InMemoryFileHandle({
  initialContent: JSON.stringify([{ existing: 'data' }], null, 2)
});

// Use it in your tests
await jappend('/test-file', { new: 'entry' }, {
  fileOpen: async () => inMemoryFileHandle
});

// Check the result
console.log(inMemoryFileHandle.content);
```

This approach allows you to:
- Test without creating actual files
- Run tests faster and more reliably
- Easily verify the exact file contents after operations

### Building

```bash
bun run build
```

## 📊 Performance

This library is designed for memory efficient scenarios. Here are benchmark results for writing 50,000 entries to a file already containing 200,000 entries:

| Method | Time | Memory Usage | Description |
|--------|------|--------------|-------------|
| `JSON.stringify` (traditional) | 2037ms | 4528MB | Load entire file, parse, modify, stringify |
| `JappendWriter` (buffered) | 637ms | 256MB | Buffered writes (10,000 entries) |
| `JappendWriter` (infinite buffer) | 657ms | 870MB | Single flush at the end |
| `JappendWriter` (fire-and-forget) | 695ms | 756MB | Buffered writes (10,000) entries fire-and-forget |
| `jappend` (unbuffered) | 12381ms | 11MB | Write each entry individually |

**Key takeaways:**
- Buffered writing provides the best balance of speed and memory usage
- Memory usage remains constant regardless of file size

Run the benchmarks yourself:

```bash
bun run benchmark
```

You might need to run the benchmarks multiple times to get the actual memory usage. If you know how make the benchmarks more deterministic, please open an issue or a Pull Request.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
