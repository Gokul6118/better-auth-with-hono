export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  bundle: true,
  external: [], // IMPORTANT
});
