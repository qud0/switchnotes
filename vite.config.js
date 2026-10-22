import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss()
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-lucide': ['lucide-react']
        }
      }
    },
    chunkSizeWarningLimit: 800
  },
  server: {
    port: 5173,
    watch: {
      ignored: ['**/data/**', '**/server/**', '**/*.log']
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3050',
        changeOrigin: true
      },
      '/ws': {
        target: 'http://localhost:3050',
        ws: true
      }
    }
  }
});
