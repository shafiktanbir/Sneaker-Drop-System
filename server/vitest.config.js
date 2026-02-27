import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: [path.join(__dirname, 'src/__tests__/setup.js')],
    testTimeout: 15000, // DB operations (especially Neon) can be slow
  },
});
