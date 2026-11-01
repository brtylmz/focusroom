import { defineConfig } from 'vite';

const SERVER = process.env.SERVER_URL ?? 'http://localhost:3001';

export default defineConfig({
  server: {
    port: 5173,
    fs: { allow: ['..'] },
    proxy: {
      '/api': { target: SERVER, changeOrigin: true },
      '/socket.io': { target: SERVER, changeOrigin: true, ws: true },
    },
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1_200,
  },
});
