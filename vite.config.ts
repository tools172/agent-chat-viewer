import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  // Prevent vite from obscuring Rust errors
  clearScreen: false,

  // Tauri expects a fixed port; fail if that port is not available
  server: {
    host: '127.0.0.1',
    port: 1420,
    strictPort: true,
    watch: {
      // Tell vite to ignore watching `src-tauri`
      ignored: ['**/src-tauri/**'],
    },
  },

  // Test configuration
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    css: true,
  },
});
