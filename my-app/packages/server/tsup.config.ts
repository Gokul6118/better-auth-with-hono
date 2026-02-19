import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['api/index.ts'],
  format: ['esm'],
  target: 'node18',

  outDir: 'dist',
  clean: true,
  sourcemap: false,

  splitting: false,
  bundle: true,

  // Bundle all workspace packages
  noExternal: ['@repo/db', '@repo/schemas'],

  // Native deps only
  external: ['pg'],
})
