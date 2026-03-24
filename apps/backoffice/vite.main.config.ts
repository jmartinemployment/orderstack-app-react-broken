import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    rollupOptions: {
      external: ['electron', 'keytar', 'node-machine-id', 'electron-log', 'electron-updater'],
    },
  },
})
