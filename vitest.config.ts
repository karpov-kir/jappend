import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['./vitest.unit.config.ts', './vitest.integ.config.ts'],
    reporters: ['default', ['vitest-sonar-reporter', { outputFile: 'coverage/test-report.xml' }]],
    coverage: {
      include: ['src/**/*.ts'],
      reporter: ['text-summary', 'lcovonly'],
      thresholds: { lines: 80, branches: 80, functions: 80, statements: 80 },
    },
  },
});
