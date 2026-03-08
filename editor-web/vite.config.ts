import { defineConfig } from 'vitest/config'

const resolveVendorChunk = (id: string) => {
  const normalized = id.replace(/\\/g, '/')

  if (!normalized.includes('/node_modules/')) {
    return undefined
  }

  if (normalized.includes('/node_modules/katex/')) {
    return 'vendor-katex'
  }

  if (
    normalized.includes('/node_modules/@milkdown/') ||
    normalized.includes('/node_modules/remark-math/') ||
    normalized.includes('/node_modules/unified/') ||
    normalized.includes('/node_modules/mdast-util-') ||
    normalized.includes('/node_modules/micromark') ||
    normalized.includes('/node_modules/unist-util-') ||
    normalized.includes('/node_modules/vfile/') ||
    normalized.includes('/node_modules/hast-util-') ||
    normalized.includes('/node_modules/property-information/') ||
    normalized.includes('/node_modules/space-separated-tokens/') ||
    normalized.includes('/node_modules/comma-separated-tokens/') ||
    normalized.includes('/node_modules/trim-lines/')
  ) {
    return 'vendor-milkdown'
  }

  if (
    normalized.includes('/node_modules/prosemirror-') ||
    normalized.includes('/node_modules/prosekit/')
  ) {
    return 'vendor-prosemirror'
  }

  if (
    normalized.includes('/node_modules/@codemirror/') ||
    normalized.includes('/node_modules/@lezer/') ||
    normalized.includes('/node_modules/crelt/') ||
    normalized.includes('/node_modules/w3c-keyname/') ||
    normalized.includes('/node_modules/style-mod/')
  ) {
    return 'vendor-codemirror'
  }

  if (
    normalized.includes('/node_modules/markdown-it') ||
    normalized.includes('/node_modules/linkify-it/') ||
    normalized.includes('/node_modules/mdurl/') ||
    normalized.includes('/node_modules/uc.micro/') ||
    normalized.includes('/node_modules/entities/') ||
    normalized.includes('/node_modules/punycode.js/')
  ) {
    return 'vendor-markdown'
  }

  if (normalized.includes('/node_modules/@floating-ui/')) {
    return 'vendor-floating-ui'
  }

  return undefined
}

export default defineConfig({
  base: './',
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
    environment: 'jsdom',
    globals: true
  }
})
