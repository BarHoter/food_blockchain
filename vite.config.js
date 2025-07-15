import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  root: 'frontend',
  base: './',
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, 'frontend/dist'),
    emptyOutDir: true
  }
});
