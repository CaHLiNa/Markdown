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
          src: 'node_modules/vditor/dist/js/lute/lute.min.js',
          dest: 'vditor/dist/js/lute'
        },
        {
          src: 'node_modules/vditor/dist/js/i18n/zh_CN.js',
          dest: 'vditor/dist/js/i18n'
        },
        {
          src: 'node_modules/vditor/dist/js/icons/ant.js',
          dest: 'vditor/dist/js/icons'
        },
        {
          src: 'node_modules/vditor/dist/js/highlight.js/styles/github.min.css',
          dest: 'vditor/dist/js/highlight.js/styles'
        },
        {
          src: 'node_modules/vditor/dist/js/highlight.js/styles/github-dark.min.css',
          dest: 'vditor/dist/js/highlight.js/styles'
        },
        {
          src: 'node_modules/vditor/dist/js/katex/katex.min.css',
          dest: 'vditor/dist/js/katex'
        },
        {
          src: 'node_modules/vditor/dist/js/katex/katex.min.js',
          dest: 'vditor/dist/js/katex'
        },
        {
          src: 'node_modules/vditor/dist/js/katex/mhchem.min.js',
          dest: 'vditor/dist/js/katex'
        },
        {
          src: 'node_modules/vditor/dist/js/katex/fonts/**/*',
          dest: 'vditor/dist/js/katex/fonts'
        },
        {
          src: 'node_modules/vditor/dist/css/content-theme/light.css',
          dest: 'vditor/dist/css/content-theme'
        },
        {
          src: 'node_modules/vditor/dist/css/content-theme/dark.css',
          dest: 'vditor/dist/css/content-theme'
        },
        {
          src: 'node_modules/vditor/dist/images/emoji/**/*',
          dest: 'vditor/dist/images/emoji'
        }
      ]
    })
  ],
  build: {
    assetsDir: '.',
    chunkSizeWarningLimit: 1500,
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
