import { build } from "esbuild";

// Pages' automatic Functions compiler (Wrangler 3.114.17 / esbuild 0.17.19)
// breaks PDF.js class initialization. Lower it with our locked modern compiler
// before Pages sees the code; ES2020 output also survives its optional rebundle.
export function buildWorker({
  entryPoint = "src/server/pages-worker.ts",
  outfile = "dist/_worker.js",
  write = true,
} = {}) {
  return build({
    entryPoints: [entryPoint],
    outfile,
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2020",
    external: ["node:*"],
    write,
  });
}

if (import.meta.main) {
  await buildWorker();
  console.log(
    "Pages backend compiled to dist/_worker.js with the project toolchain.",
  );
}
