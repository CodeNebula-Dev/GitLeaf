import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4411',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', (_err, _req, res: any) => {
            if (res && !res.headersSent && typeof res.writeHead === 'function') {
              res.writeHead(503, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Server starting...' }));
            }
          });
        },
      },
      '/ws': {
        target: 'ws://localhost:4411',
        ws: true,
        configure: (proxy) => {
          proxy.on('error', () => {
            // Silence WebSocket proxy reconnect errors during initial boot
          });
        },
      },
    },
  },
});
