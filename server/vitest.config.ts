import os from 'node:os';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      ATLAS_DATA_DIR: path.join(os.tmpdir(), `atlas-test-${process.pid}`),
      ATLAS_DASHBOARD_CHECKS: 'false',
      NODE_ENV: 'test',
    },
    testTimeout: 20000,
  },
});
