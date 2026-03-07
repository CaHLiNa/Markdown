import { defineConfig } from 'vitest/config'

export default defineConfig({
  base: './',
  build: {
    assetsDir: '.',
    emptyOutDir: true,
    outDir: '../Markdown/Editor',
    rollupOptions: {
      output: {
        assetFileNames: '[name][extname]',
        chunkFileNames: '[name].js',
        entryFileNames: 'index.js'
      }
    }
  },
  test: {
    environment: 'jsdom',
    globals: true
  }
})
