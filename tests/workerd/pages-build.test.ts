import { test } from "node:test";
import assert from "node:assert/strict";
import { Miniflare } from "miniflare";
import { readFile } from "node:fs/promises";
import { buildWorker } from "../../scripts/build-worker.ts";
import { samplePdf } from "../fixtures/pdf.ts";

test("production compiler initializes PDF.js on cold and repeated uploads", async () => {
  const bundle = await buildWorker({
    entryPoint: "tests/workerd/pdf-worker.ts",
    write: false,
  });
  const runtime = new Miniflare({
    modules: true,
    script: bundle.outputFiles![0].text,
    compatibilityDate: "2026-08-06",
    cf: false,
  });
  try {
    const bytes = await samplePdf();
    const hash = Buffer.from(
      await crypto.subtle.digest("SHA-256", bytes),
    ).toString("hex");
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await runtime.dispatchFetch(
        "https://test.local/api/workspaces/test/documents",
        {
          method: "POST",
          body: bytes,
          headers: {
            "Content-Type": "application/pdf",
            "Idempotency-Key": `production-test-${attempt}`,
            "x-test-approved-hash": hash,
          },
        },
      );
      const result = await response.json();
      assert.equal(response.status, 201, JSON.stringify(result));
      assert.match(JSON.stringify(result), /14 calendar days/);
    }
  } finally {
    await runtime.dispose();
  }
});

test("Pages bundle keeps API requests on the authenticated handler and serves static pages", async () => {
  const bundle = await buildWorker({ write: false });
  const runtime = new Miniflare({
    modules: true,
    script: bundle.outputFiles![0].text,
    compatibilityDate: "2026-08-06",
    cf: false,
    serviceBindings: {
      ASSETS: async (request: { url: string }) =>
        new Response(`asset:${new URL(request.url).pathname}`),
    },
  });
  try {
    for (const path of [
      "/api",
      "/api/usage",
      "/api/workspaces/test/documents",
      "/api/auth/google",
    ]) {
      const response = await runtime.dispatchFetch(`https://test.local${path}`);
      assert.equal(response.status, 503);
      assert.match(await response.text(), /Sign-in is not configured/);
      assert.equal(response.headers.get("Cache-Control"), "no-store");
    }
    for (const path of [
      "/",
      "/app",
      "/demo",
      "/assets/site.css",
      "/fixtures/contract.pdf",
      "/api-not-a-route",
    ]) {
      const response = await runtime.dispatchFetch(`https://test.local${path}`);
      assert.equal(response.status, 200);
      assert.equal(await response.text(), `asset:${path}`);
    }
    assert.deepEqual(
      JSON.parse(await readFile("public/_routes.json", "utf8")),
      {
        version: 1,
        include: ["/api", "/api/*"],
        exclude: [],
      },
    );
  } finally {
    await runtime.dispose();
  }
});
