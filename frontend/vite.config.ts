/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// La build finisce in ../public (ignorata da git), che il backend serve così com'è.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { outDir: '../public', emptyOutDir: true },
  server: { proxy: { '/api': 'http://127.0.0.1:8080', '/covers': 'http://127.0.0.1:8080', '/logo': 'http://127.0.0.1:8080' } },
  test: { environment: 'jsdom', globals: true, setupFiles: ['./src/test-setup.ts'], css: false },
});
