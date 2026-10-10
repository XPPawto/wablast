import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Saat development, request /api diteruskan ke backend Express di port 4000
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': 'http://localhost:4000' } },
});
