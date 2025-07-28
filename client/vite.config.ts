import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [
          [
            'babel-plugin-react-compiler',
            {
              runtimeModule: 'react-compiler-runtime',
            },
          ],
        ],
      },
    }),
    tailwindcss(),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react')) {
              return 'react-vendor'
            }
            if (id.includes('hls.js')) {
              return 'hls'
            }
            return 'vendor' // Group other dependencies
          }
        },
      },
    },
  },
  server: {
    proxy: {
      '/api/v1/auth/google': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
