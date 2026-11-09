import { expect, test } from 'vitest';

import { InMemoryFileHandle } from './InMemoryFileHandle';

test(`reads data at the end`, async () => {
  const sample = `abc\ndef\nghi`;
  const inMemoryFileHandle = new InMemoryFileHandle({
    initialContent: sample,
  });
  const buffer = Buffer.alloc(5);
  const readPosition = sample.length - 5;

  const { bytesRead } = await inMemoryFileHandle.read(buffer, 0, 5, readPosition);

  expect(bytesRead).toBe(5);
  expect(buffer.toString()).toBe(`f\nghi`);
});

test(`reads data in the the middle`, async () => {
  const sample = `abc\ndef\nghi`;
  const inMemoryFileHandle = new InMemoryFileHandle({
    initialContent: sample,
  });
  const buffer = Buffer.alloc(3);
  const readPosition = sample.length - 7;

  const { bytesRead } = await inMemoryFileHandle.read(buffer, 0, 3, readPosition);

  expect(bytesRead).toBe(3);
  expect(buffer.toString()).toBe(`def`);
});

test(`reads data at the begging`, async () => {
  const sample = `abc\ndef\nghi`;
  const inMemoryFileHandle = new InMemoryFileHandle({
    initialContent: sample,
  });
  const buffer = Buffer.alloc(3);
  const readPosition = 0;

  const { bytesRead } = await inMemoryFileHandle.read(buffer, 0, 3, readPosition);

  expect(bytesRead).toBe(3);
  expect(buffer.toString()).toBe(`abc`);
});

test(`writes data in the middle`, async () => {
  const sample = `abc\ndef\nghi`;
  const inMemoryFileHandle = new InMemoryFileHandle({
    initialContent: sample,
  });
  const newData = `zxc\n`;
  const writePosition = sample.length - 7;

  const { bytesWritten, buffer } = await inMemoryFileHandle.write(newData, writePosition);

  const expected = `abc\nzxc\nghi`;

  expect(bytesWritten).toBe(newData.length);
  expect(buffer).toBe(expected);
});

test(`appends data to the end`, async () => {
  const sample = `abc\ndef\nghi`;
  const inMemoryFileHandle = new InMemoryFileHandle({
    initialContent: sample,
  });
  const newData = `jkl\n`;

  const { bytesWritten, buffer } = await inMemoryFileHandle.write(newData);

  const expected = `abc\ndef\nghijkl\n`;

  expect(bytesWritten).toBe(newData.length);
  expect(buffer).toBe(expected);
});

test(`writes data at the beginning`, async () => {
  const sample = `abc\ndef\nghi`;
  const inMemoryFileHandle = new InMemoryFileHandle({
    initialContent: sample,
  });
  const newData = `xyz\n`;
  const writePosition = 0;

  const { bytesWritten, buffer } = await inMemoryFileHandle.write(newData, writePosition);

  const expected = `xyz\ndef\nghi`;

  expect(bytesWritten).toBe(newData.length);
  expect(buffer).toBe(expected);
});
