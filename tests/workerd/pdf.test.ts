import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { Miniflare } from "miniflare";
import { samplePdf } from "../fixtures/pdf.ts";
import { fileURLToPath } from "node:url";
import type { Readable } from "node:stream";
import { officeFixture } from "../fixtures/office.ts";

for (const scenario of [
  "web",
  "nodejs_compat",
  "minified",
  "open-failure",
  "other-fixture-open-failure",
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
              if (${JSON.stringify(scenario)}.endsWith("open-failure")) throw new TypeError("Object.defineProperty called on non-object: secret document contents");
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
    const logMessages: string[] = [];
    const runtime = new Miniflare({
      handleRuntimeStdio(stdout: Readable, stderr: Readable) {
        for (const stream of [stdout, stderr])
          stream.on("data", (chunk: Buffer) =>
            logMessages.push(chunk.toString()),
          );
      },
      modules: true,
      script: bundle.outputFiles[0].text,
      compatibilityDate: "2026-08-06",
      compatibilityFlags: scenario === "nodejs_compat" ? ["nodejs_compat"] : [],
      cf: false,
    });
    try {
      const bytes =
        scenario === "other-fixture-open-failure"
          ? await samplePdf(1, "Another public synthetic fixture.")
          : await samplePdf();
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
        scenario.endsWith("open-failure") ||
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
        // Worker console messages arrive asynchronously over process stdio.
        for (
          let attempt = 0;
          attempt < 50 &&
          !logMessages.some((message) =>
            message.includes("[folioask:pdf-failure]"),
          );
          attempt++
        )
          await new Promise((resolve) => setTimeout(resolve, 20));
        const logs = logMessages.join("");
        assert.match(logs, /\[folioask:pdf-failure\]/);
        assert.doesNotMatch(logs, /secret|private text|private cleanup/);
        if (scenario === "open-failure") {
          assert.match(logs, /bundled-synthetic-contract/);
          assert.match(logs, /Object.defineProperty called on non-object/);
        } else {
          assert.doesNotMatch(logs, /bundled-synthetic-contract/);
        }
        assert.doesNotMatch(
          JSON.stringify(result),
          /bundled-synthetic-contract|defineProperty/,
        );
      } else {
        assert.equal(response.status, 201, JSON.stringify(result));
        assert.ok(JSON.stringify(result).includes("14 calendar days"));
      }
    } finally {
      await runtime.dispose();
    }
  });

test("Cloudflare runtime admits bounded public PDF, Office and text documents without an allowlist", async () => {
  const bundle = await build({
    entryPoints: ["tests/workerd/pdf-worker.ts"],
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    target: "es2022",
    external: ["node:*"],
  });
  const runtime = new Miniflare({
    modules: true,
    script: bundle.outputFiles[0].text,
    compatibilityDate: "2026-08-06",
    cf: false,
  });
  try {
    const padded = new Uint8Array(30_000_000).fill(32);
    padded.set(await samplePdf());
    const cases: [string, Uint8Array][] = [
      ["100-pages.pdf", await samplePdf(100)],
      ["30mb.pdf", padded],
      ["report.docx", officeFixture("docx")],
      ["table.xlsx", officeFixture("xlsx")],
      [
        "notes.txt",
        new TextEncoder().encode(
          "Shop drawings are due within 14 calendar days.",
        ),
      ],
    ];
    for (const [name, bytes] of cases) {
      const response = await runtime.dispatchFetch(
        `https://test.local/api/workspaces/test/documents?name=${name}`,
        {
          method: "POST",
          body: bytes,
          headers: {
            "Content-Type": "application/octet-stream",
            "Idempotency-Key": crypto.randomUUID(),
            "X-Folio-Document-Privacy": "public",
            "X-Folio-Public-Consent": "public-non-sensitive-v1",
          },
        },
      );
      assert.equal(
        response.status,
        201,
        `${name}: ${await response.clone().text()}`,
      );
      assert.match(await response.text(), /14 calendar days|Doors/);
    }
  } finally {
    await runtime.dispose();
  }
});
