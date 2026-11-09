import { describe, expect, test } from 'vitest';

import { InMemoryFileHandle } from '../tests/InMemoryFileHandle';
import { jappend } from './jappend';

test('writes an initial array if the file is empty and `initArray` is `true`', async () => {
  const inMemoryFileHandle = new InMemoryFileHandle();
  const newData = { test: [3] };

  await jappend('/file', newData, { initArray: true, fileOpen: async () => inMemoryFileHandle });

  expect(inMemoryFileHandle.content).toBe(JSON.stringify([{ test: [3] }], null, 2));
});

describe('Objects', () => {
  test(`appends an object to the existing JSON array file`, async () => {
    const inMemoryFileHandle = new InMemoryFileHandle({
      initialContent: JSON.stringify([{ test: [1] }, { test: [2] }], null, 2),
    });
    const newData = { test: [3] };

    await jappend('/file', newData, { fileOpen: async () => inMemoryFileHandle });

    expect(inMemoryFileHandle.content).toBe(JSON.stringify([{ test: [1] }, { test: [2] }, { test: [3] }], null, 2));
  });

  test('fails to append an object if the file is empty and `initArray`` is `false`', async () => {
    const inMemoryFileHandle = new InMemoryFileHandle();
    const newData = { test: [3] };

    await expect(
      jappend('/file', newData, { initArray: false, fileOpen: async () => inMemoryFileHandle }),
    ).rejects.toThrow(
      'The file does not contain a valid JSON array. Please ensure the file contains a valid JSON array before appending data.',
    );
  });

  test(`appends and object to the existing JSON array without formatting`, async () => {
    const inMemoryFileHandle = new InMemoryFileHandle({
      initialContent: JSON.stringify([{ test: [1] }, { test: [2] }]),
    });
    const newData = { test: [3] };

    await jappend('/file', newData, { pretty: false, fileOpen: async () => inMemoryFileHandle });

    expect(inMemoryFileHandle.content).toBe(JSON.stringify([{ test: [1] }, { test: [2] }, { test: [3] }]));
  });

  test(`appends and object to the existing JSON array with custom indentation`, async () => {
    const inMemoryFileHandle = new InMemoryFileHandle({
      initialContent: JSON.stringify([{ test: [1] }, { test: [2] }], null, 4),
    });
    const newData = { test: [3] };

    await jappend('/file', newData, { indent: 4, fileOpen: async () => inMemoryFileHandle });

    expect(inMemoryFileHandle.content).toBe(JSON.stringify([{ test: [1] }, { test: [2] }, { test: [3] }], null, 4));
  });
});

describe('Arrays', () => {
  test(`appends an empty object to the existing JSON array file`, async () => {
    const inMemoryFileHandle = new InMemoryFileHandle({
      initialContent: JSON.stringify([{ test: [1] }], null, 2),
    });
    const newData = {};

    await jappend('/file', newData, { fileOpen: async () => inMemoryFileHandle });

    expect(inMemoryFileHandle.content).toBe(JSON.stringify([{ test: [1] }, {}], null, 2));
  });

  test(`append an array to the existing JSON array file`, async () => {
    const inMemoryFileHandle = new InMemoryFileHandle({
      initialContent: JSON.stringify([{ test: [1] }], null, 2),
    });
    const newData = [{ test: [2] }, { test: [3] }];

    await jappend('/file', newData, { fileOpen: async () => inMemoryFileHandle });

    expect(inMemoryFileHandle.content).toBe(JSON.stringify([{ test: [1] }, [{ test: [2] }, { test: [3] }]], null, 2));
  });

  test(`appends an array to the existing JSON array file without formatting`, async () => {
    const inMemoryFileHandle = new InMemoryFileHandle({
      initialContent: JSON.stringify([{ test: [1] }]),
    });
    const newData = [{ test: [2] }, { test: [3] }];

    await jappend('/file', newData, { pretty: false, fileOpen: async () => inMemoryFileHandle });

    expect(inMemoryFileHandle.content).toBe(JSON.stringify([{ test: [1] }, [{ test: [2] }, { test: [3] }]]));
  });

  test(`appends an array to the existing JSON array file with custom indentation`, async () => {
    const inMemoryFileHandle = new InMemoryFileHandle({
      initialContent: JSON.stringify([{ test: [1] }], null, 4),
    });
    const newData = [{ test: [2] }, { test: [3] }];

    await jappend('/file', newData, { indent: 4, fileOpen: async () => inMemoryFileHandle });

    expect(inMemoryFileHandle.content).toBe(JSON.stringify([{ test: [1] }, [{ test: [2] }, { test: [3] }]], null, 4));
  });
});

describe('Strings', () => {
  test(`appends a string to the existing JSON array file`, async () => {
    const inMemoryFileHandle = new InMemoryFileHandle({
      initialContent: JSON.stringify([{ test: [1] }], null, 2),
    });
    const newData = 'Hello, World!';

    await jappend('/file', newData, { fileOpen: async () => inMemoryFileHandle });

    expect(inMemoryFileHandle.content).toBe(JSON.stringify([{ test: [1] }, 'Hello, World!'], null, 2));
  });

  test(`appends an empty string that contains just spaces to the existing JSON array file`, async () => {
    const inMemoryFileHandle = new InMemoryFileHandle({
      initialContent: JSON.stringify([{ test: [1] }], null, 2),
    });
    const newData = ' \n ';

    await jappend('/file', newData, { fileOpen: async () => inMemoryFileHandle });

    expect(inMemoryFileHandle.content).toBe(JSON.stringify([{ test: [1] }, ' \n '], null, 2));
  });
});
