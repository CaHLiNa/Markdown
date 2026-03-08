import { viteStaticCopy } from 'vite-plugin-static-copy'
import { defineConfig } from 'vitest/config'

const resolveVendorChunk = (id: string) => {
  const normalized = id.replace(/\\/g, '/')

  if (!normalized.includes('/node_modules/')) {
    return undefined
  }

  if (normalized.includes('/node_modules/katex/')) {
    return 'vendor-katex'
  }

  if (normalized.includes('/node_modules/vditor/')) {
    return 'vendor-vditor'
  }

  return undefined
}

export default defineConfig({
  base: './',
  plugins: [
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/vditor/dist/**/*',
          dest: 'vditor/dist'
        }
      ]
    })
  ],
  build: {
    assetsDir: '.',
    chunkSizeWarningLimit: 550,
    emptyOutDir: true,
    outDir: '../Markdown/Editor',
    rollupOptions: {
      output: {
        assetFileNames: '[name][extname]',
        chunkFileNames: '[name].js',
        entryFileNames: 'index.js',
        manualChunks: resolveVendorChunk
      }
    }
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'jsdom',
    globals: true
  }
})
