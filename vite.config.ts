/// <reference types="vitest" />
import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import { resolve } from 'path';
import manifest from './src/manifest.json';

/**
 * Plugin to make Vite's __vitePreload helper service-worker compatible.
 * The default preload helper uses document.createElement which fails in service workers.
 * This plugin replaces DOM-based preloading with a service-worker-safe version.
 */
function serviceWorkerPreloadPlugin(): Plugin {
  return {
    name: 'service-worker-preload',
    enforce: 'post',
    generateBundle(_, bundle) {
      // Only modify chunks that are part of the service worker
      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (
          chunk.type === 'chunk' &&
          (fileName.includes('index.ts-') || // Background service worker chunks
            fileName.includes('settings.types-')) // Shared chunk used by SW
        ) {
          // Check if this chunk has the document-based preload code
          if (chunk.code.includes('typeof document<"u"&&document.createElement')) {
            // Find the variable name used for the preload function (exported as _)
            const exportMatch = chunk.code.match(/export\{(\w+)\s+as\s+_/);
            const preloadVarName = exportMatch ? exportMatch[1] : 'g';

            // The Vite preload helper structure in minified form:
            // const f=function(){...}(),h=function(a){...},u={},g=function(n,l,y){...return n().catch(c)})};
            // The ending is: return n().catch(c) } ) } ;
            // - catch(c) - the catch call
            // - } - closes arrow function inside then
            // - ) - closes the then() call
            // - } - closes the outer function g
            // - ; - ends the const statement
            chunk.code = chunk.code.replace(
              /const \w+=function\(\)\{const \w+=typeof document<"u"&&document\.createElement\("link"\)\.relList[\s\S]*?return \w+\(\)\.catch\(\w+\)\}\)\};/,
              `const ${preloadVarName}=function(n){return n()};`
            );
          }
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), crx({ manifest }), serviceWorkerPreloadPlugin()],

  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@core': resolve(__dirname, 'src/core'),
      '@storage': resolve(__dirname, 'src/storage'),
      '@ai': resolve(__dirname, 'src/ai'),
      '@shared': resolve(__dirname, 'src/shared'),
    },
  },

  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: process.env.NODE_ENV === 'development',
    target: 'esnext', // Support top-level await for pdf.js
    // Disable modulePreload entirely - polyfill uses DOM APIs that fail in service workers
    modulePreload: false,
  },

  esbuild: {
    target: 'esnext',
  },

  optimizeDeps: {
    esbuildOptions: {
      target: 'esnext',
    },
  },

  server: {
    port: 5173,
    strictPort: true,
    hmr: {
      port: 5173,
    },
  },

  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/core/**', 'src/shared/**'],
      thresholds: {
        // Start with achievable thresholds, increase as tests grow
        statements: 30,
        branches: 20,
        functions: 25,
        lines: 30,
      },
    },
  },
});
