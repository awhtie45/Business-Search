import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Always use the same address: in local mode your data is saved per browser *and* per address,
  // so a different port would look like an empty app.
  server: { port: 5173, strictPort: true, open: true },
  preview: { port: 5173, strictPort: true },
  test: { environment: 'node' },
} as never);
