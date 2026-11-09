import { createId } from '@paralleldrive/cuid2';
import fs from 'fs/promises';
import path from 'path';
import { type TransformCallback, Writable } from 'stream';
import { afterAll, expect, test } from 'vitest';

import { jappend, newJappendWriter } from '../src/jappend';
import type { JappendWriter } from '../src/JappendWriter';
import { FakeReadableStream } from './FakeReadableStream';

afterAll(async () => {
  await removeAllTestJsonFiles();
});

test('appends an entry to a json file', async () => {
  const testJsonFilePath = await createTestJsonFileWithContent([]);

  await jappend(testJsonFilePath, { newKey: 'newValue' });

  await verifyFileContent(testJsonFilePath, [{ newKey: 'newValue' }]);
});

test('appends multiple entries', async () => {
  const testJsonFilePath = await createTestJsonFileWithContent([{ existingKey: 'existingValue' }]);

  await jappend(testJsonFilePath, { newKey1: 'newValue1' });
  await jappend(testJsonFilePath, ['Hello', 'World']);

  await verifyFileContent(testJsonFilePath, [
    { existingKey: 'existingValue' },
    { newKey1: 'newValue1' },
    ['Hello', 'World'],
  ]);
});

test('creates a new file if it does not exist', async () => {
  const testJsonFilePath = createTestJsonFilePath();

  await jappend(testJsonFilePath, { newKey: 'newValue' });

  await verifyFileContent(testJsonFilePath, [{ newKey: 'newValue' }]);
});

test('fails if file does not exist and `initArray` is `false`', async () => {
  const testJsonFilePath = createTestJsonFilePath();

  await expect(jappend(testJsonFilePath, { newKey: 'newValue' }, { initArray: false })).rejects.toThrow(
    expect.objectContaining({ message: expect.stringContaining('no such file or directory') }),
  );
});

test('streams data to a file', async () => {
  const stream = new FakeReadableStream({
    objectMode: true,
  });

  class WriteStream extends Writable {
    private readonly writer: JappendWriter;

    constructor(writer: JappendWriter) {
      super({ objectMode: true });
      this.writer = writer;
    }

    override _write(entry: { id: string; value: string }, encoding: BufferEncoding, done: TransformCallback) {
      this.writer
        .append(entry)
        .then(() => done())
        .catch((err) => done(new Error(`Failed to write event: ${err.message}`)));
    }
  }

  const testJsonFilePath = createTestJsonFilePath();
  const jappendWriter = newJappendWriter(testJsonFilePath, {
    bufferFlushThreshold: 10,
  });

  const deferred = createDeferred();
  const writeStream = new WriteStream(jappendWriter);
  let flushPromise: Promise<void> | undefined;
  stream.pipe(writeStream).on('finish', async () => {
    try {
      await jappendWriter.flush({ shutdown: true });
      await flushPromise;
    } catch (error) {
      console.error('Failed to flush analytics data:', error);
    }

    deferred.resolve();
  });

  const data = Array.from({ length: 100 }, (_, i) => ({ id: createId(), value: `value-${i}` }));

  for (const entry of data) {
    stream.readMore(entry);
  }

  stream.finish();

  await deferred.promise;

  await verifyFileContent(testJsonFilePath, data);
});

function createTestJsonFilePath() {
  return path.join(__dirname, `test-file-${createId()}.json`);
}

async function createTestJsonFileWithContent(content: unknown) {
  const filePath = createTestJsonFilePath();
  await fs.writeFile(filePath, JSON.stringify(content, null, 2));
  return filePath;
}

async function removeAllTestJsonFiles(): Promise<void> {
  const fileNames = await fs.readdir(__dirname);
  const testJsonFilePaths = fileNames
    .filter((fileName) => fileName.startsWith('test-file-') && fileName.endsWith('.json'))
    .map((fileName) => path.join(__dirname, fileName));
  await Promise.all(testJsonFilePaths.map((file) => fs.unlink(file)));
}

async function verifyFileContent(fileName: string, expectedContent: unknown): Promise<void> {
  const content = await fs.readFile(fileName, 'utf8');
  expect(JSON.parse(content)).toEqual(expectedContent);
}

function createDeferred<T = void>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: T) => void;
} {
  let resolve: ((value: T) => void) | undefined = undefined;
  let reject: ((error: unknown) => void) | undefined = undefined;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  if (!resolve || !reject) {
    throw new Error('Deferred promise must have both resolve and reject functions defined.');
  }

  return { promise, resolve, reject };
}
