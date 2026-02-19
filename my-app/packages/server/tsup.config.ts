import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],

  format: ["esm"],

  splitting: false,

  sourcemap: true,

  clean: true,

  dts: false,

  external: [], // <-- bundle everything (including @repo/db)

  target: "node20",
});
