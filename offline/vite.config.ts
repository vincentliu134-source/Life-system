import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  root: path.resolve(__dirname),
  base: process.env.MOBILE_BASE_PATH || '/',
  resolve: { alias: { '@': path.resolve(__dirname, '..') } },
  esbuild: { jsx: 'automatic' },
  build: { outDir: path.resolve(__dirname, '../dist-mobile'), emptyOutDir: true, target: 'es2022' },
});
