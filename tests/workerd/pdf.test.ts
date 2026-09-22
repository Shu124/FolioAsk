import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { Miniflare } from "miniflare";
import { samplePdf } from "../fixtures/pdf.ts";
import { fileURLToPath } from "node:url";

for (const scenario of [
  "web",
  "nodejs_compat",
  "minified",
  "open-failure",
  "cleanup-failure",
  "text-and-cleanup-failure",
])
  test(`Cloudflare PDF upload: ${scenario}`, async () => {
    const fault = scenario.endsWith("failure");
    const realModule = fileURLToPath(import.meta.resolve("unpdf"));
    const bundle = await build({
      entryPoints: ["tests/workerd/pdf-worker.ts"],
      bundle: true,
      minify: scenario === "minified",
      write: false,
      format: "esm",
      platform: "browser",
      target: "es2022",
      external: ["node:*"],
      plugins: fault
        ? [
            {
              name: "test-parser-fault",
              setup(builder) {
                builder.onResolve({ filter: /^unpdf$/ }, () => ({
                  path: "parser",
                  namespace: "test-parser",
                }));
                builder.onLoad(
                  { filter: /.*/, namespace: "test-parser" },
                  () => ({
                    resolveDir: process.cwd(),
                    contents: `import { getDocumentProxy as real } from ${JSON.stringify(realModule)};
            export async function getDocumentProxy(bytes) {
              if (${JSON.stringify(scenario)} === "open-failure") throw new TypeError("secret document contents");
              const pdf = await real(bytes);
              return {
                numPages: pdf.numPages,
                getPage: async (number) => {
                  const page = await pdf.getPage(number);
                  if (${JSON.stringify(scenario)} === "text-and-cleanup-failure") page.getTextContent = async () => { throw new TypeError("private text"); };
                  return page;
                },
                loadingTask: { destroy: async () => { await pdf.loadingTask.destroy(); throw new Error("private cleanup data"); } }
              };
            }`,
                  }),
                );
              },
            },
          ]
        : [],
    });
    const runtime = new Miniflare({
      modules: true,
      script: bundle.outputFiles[0].text,
      compatibilityDate: "2026-08-06",
      compatibilityFlags: scenario === "nodejs_compat" ? ["nodejs_compat"] : [],
      cf: false,
    });
    try {
      const bytes = await samplePdf();
      const hash = Buffer.from(
        await crypto.subtle.digest("SHA-256", bytes),
      ).toString("hex");
      const response = await runtime.dispatchFetch(
        "https://test.local/api/workspaces/test/documents",
        {
          method: "POST",
          body: bytes,
          headers: {
            "Content-Type": "application/pdf",
            "Idempotency-Key": "test-upload-123456",
            "x-test-approved-hash": hash,
          },
        },
      );
      const result = await response.json();
      assert.ok(result && typeof result === "object");
      if (
        scenario === "open-failure" ||
        scenario === "text-and-cleanup-failure"
      ) {
        assert.equal(response.status, 503, JSON.stringify(result));
        assert.match(
          JSON.stringify(result),
          /PDF processing is temporarily unavailable/,
        );
        assert.doesNotMatch(JSON.stringify(result), /secret|private/);
        assert.deepEqual(result, {
          ...result,
          reservations: 0,
          writes: 0,
          commits: 0,
        });
      } else {
        assert.equal(response.status, 201, JSON.stringify(result));
        assert.ok(JSON.stringify(result).includes("14 calendar days"));
      }
    } finally {
      await runtime.dispose();
    }
  });
