import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    allowedHosts: true,
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true,
      },
      '/auth': {
        target: 'http://localhost:3001',
        changeOrigin: false,
        xfwd: true,
      },
      '/api': {
        target: 'http://localhost:3001',
      },
    },
  },
  build: {
    outDir: 'dist',
  },
});
