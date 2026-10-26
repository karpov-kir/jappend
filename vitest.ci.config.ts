import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.integ.ts'],
    reporters: [
      [
        'vitest-sonar-reporter',
        {
          outputFile: 'coverage/test-report.xml',
        },
      ],
    ],
    coverage: {
      enabled: true,
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
    },
  },
});
