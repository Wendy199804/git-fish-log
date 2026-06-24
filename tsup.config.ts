import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  clean: true,
  dts: false,
  minify: false,
  sourcemap: false,
  shims: true,
  banner: {
    js: '#!/usr/bin/env node',
  },
});
