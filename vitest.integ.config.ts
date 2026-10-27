import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'integration',
    include: ['tests/**/*.integ.ts'],
  },
});
