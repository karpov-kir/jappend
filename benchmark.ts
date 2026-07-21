import fs from 'fs/promises';
import path from 'path';

import { jappend, newJappendWriter } from './src/jappend';

const bigJsonFilePath = path.join(__dirname, 'bigJsonFile.json');
const initialEntryCount = 200000;
const entryCountToWrite = 50000;

const type = process.argv[2] as
  | 'default'
  | 'library'
  | 'buffer'
  | 'infinite-buffer'
  | 'fire-and-forget'
  | 'all'
  | undefined;

if (!type) {
  throw new Error(
    'Type argument is required. Use: default | library | buffer | infinite-buffer. Usage: bun performance.ts <type>.',
  );
}

type Entry = {
  test1: number[];
  test2: string;
};

function createEntry(i: number): Entry {
  return { test1: [i], test2: i.toString().repeat(1000) };
}

async function createBigJsonFile() {
  if (await fs.exists(bigJsonFilePath)) {
    await fs.unlink(bigJsonFilePath);
  }

  await fs.writeFile(bigJsonFilePath, '');

  const data = [];
  for (let i = 0; i < initialEntryCount; i++) {
    data.push(createEntry(i));
  }

  await fs.writeFile(bigJsonFilePath, JSON.stringify(data, null, 2));
}

async function verifyBigJsonFileAndRemove() {
  if (!(await fs.exists(bigJsonFilePath))) {
    throw new Error(`File ${bigJsonFilePath} does not exist.`);
  }

  const data = JSON.parse(await fs.readFile(bigJsonFilePath, 'utf-8')) as Entry[];
  if (!Array.isArray(data)) {
    throw new Error(`Data in ${bigJsonFilePath} is not an array.`);
  }

  if (data.length !== initialEntryCount + entryCountToWrite) {
    throw new Error(
      `Expected ${initialEntryCount + entryCountToWrite} entries, but found ${data.length} in ${bigJsonFilePath}.`,
    );
  }

  await fs.unlink(bigJsonFilePath);
}

async function appendToBigJsonFile({
  appendStrategy,
  onDone,
}: {
  appendStrategy: (index: number) => Promise<void>;
  onDone?: () => Promise<void>;
}) {
  const fromIndex = initialEntryCount;
  const toIndex = initialEntryCount + entryCountToWrite;
  for (let i = fromIndex; i < toIndex; i++) {
    await appendStrategy(i);
  }

  if (onDone) {
    await onDone();
  }
}

async function appendBigJsonFileDefault() {
  const newData: Entry[] = [];

  await appendToBigJsonFile({
    appendStrategy: async (i) => {
      newData.push(createEntry(i));
    },
    onDone: async () => {
      const existingData = JSON.parse(await fs.readFile(bigJsonFilePath, 'utf-8')) as Entry[];
      const totalData = [...existingData, ...newData];
      await fs.writeFile(bigJsonFilePath, JSON.stringify(totalData, null, 2));
    },
  });
}

async function appendBigJsonFileUsingJappend() {
  await appendToBigJsonFile({
    appendStrategy: async (i) => {
      await jappend(bigJsonFilePath, createEntry(i));
    },
  });
}

const bufferFlushThreshold = 10000;

async function appendBigJsonFileUsingJappendFireAndForget() {
  const jappendWriter = newJappendWriter(bigJsonFilePath, {
    bufferFlushThreshold,
    suppressThresholdFlushErrors: true,
  });

  await appendToBigJsonFile({
    appendStrategy: async (i) => {
      // Fire-and-forget: intentionally do not await the append call
      jappendWriter.append(createEntry(i));
    },
    onDone: async () => {
      await jappendWriter.flush();
    },
  });
}

async function createBigJsonFileUsingJappendWithBuffer() {
  const jappendWriter = newJappendWriter(bigJsonFilePath, {
    bufferFlushThreshold,
  });

  await appendToBigJsonFile({
    appendStrategy: async (i) => {
      await jappendWriter.append(createEntry(i));
    },
    onDone: async () => {
      await jappendWriter.flush();
    },
  });
}

async function createBigJsonFileUsingJappendWithInfiniteBuffer() {
  const jappendWriter = newJappendWriter(bigJsonFilePath, {
    bufferFlushThreshold: Infinity,
  });

  await appendToBigJsonFile({
    appendStrategy: async (i) => {
      await jappendWriter.append(createEntry(i));
    },
    onDone: async () => {
      await jappendWriter.flush();
    },
  });
}

async function benchmark(label: string, fn: () => Promise<void>) {
  console.log('------');
  console.log(`Starting benchmark: ${label}`);

  console.log(`Creating a big JSON file with ${initialEntryCount} entries`);
  await createBigJsonFile();

  Bun.gc(true);

  const memoryBefore = process.memoryUsage().heapUsed;

  performance.mark('start');
  console.log(`Writing ${entryCountToWrite} entries to the big JSON file`);
  await fn();
  performance.mark('end');

  const memoryAfter = process.memoryUsage().heapUsed;
  const memoryDiffMb = ((memoryAfter - memoryBefore) / 1024 / 1024).toFixed(2);

  await verifyBigJsonFileAndRemove();

  console.log('Verification of the big JSON file completed successfully');

  console.log(`Time taken: ${performance.measure(label, 'start', 'end').duration.toFixed(2)} ms`);
  console.log(`Memory change: ${memoryDiffMb} MB`);
}

if (type === 'default' || type === 'all') {
  await benchmark('Writing to a big JSON file at once using `JSON.stringify`', appendBigJsonFileDefault);
}

if (type === 'library' || type === 'all') {
  await benchmark('Writing to a big file line by line using `jappend`', appendBigJsonFileUsingJappend);
}

if (type === 'fire-and-forget' || type === 'all') {
  await benchmark(
    `Writing to a big file line by line using \`JappendWriter\` with ${bufferFlushThreshold} entry buffer (fire-and-forget)`,
    appendBigJsonFileUsingJappendFireAndForget,
  );
}

if (type === 'buffer' || type === 'all') {
  await benchmark(
    `Writing to a big file using \`JappendWriter\` with ${bufferFlushThreshold} entry buffer`,
    createBigJsonFileUsingJappendWithBuffer,
  );
}

if (type === 'infinite-buffer' || type === 'all') {
  await benchmark(
    'Writing to a big file at once using `JappendWriter` with infinite entry buffer',
    createBigJsonFileUsingJappendWithInfiniteBuffer,
  );
}
