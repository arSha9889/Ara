import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Deployment trigger: temporary no-op change.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
});
