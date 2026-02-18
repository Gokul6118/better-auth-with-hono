import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  bundle: true,        // 🔥 IMPORTANT
  splitting: false,
  sourcemap: false,
  clean: true,
  external: [],        // 🔥 DO NOT EXCLUDE db
});
