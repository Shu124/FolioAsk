import { test } from "node:test";
import assert from "node:assert/strict";
import { pdfFailure } from "../../src/server/pdf-errors.ts";
import { samplePdf } from "../fixtures/pdf.ts";

async function fixtureHash() {
  return Buffer.from(
    await crypto.subtle.digest("SHA-256", await samplePdf()),
  ).toString("hex");
}

test("temporary PDF probe is restricted to the exact fixture and open stage", async (t) => {
  const logger = t.mock.method(console, "error", () => {});
  const hash = await fixtureHash();
  for (const [stage, contentHash] of [
    ["open", undefined],
    ["open", "contract.pdf"],
    ["open", "0".repeat(64)],
    ["text", hash],
    ["cleanup", hash],
  ] as const) {
    pdfFailure(
      new TypeError("Object.defineProperty called on non-object"),
      stage,
      contentHash,
    );
    assert.equal(logger.mock.calls.at(-1)!.arguments[1].probe, undefined);
  }
  const error = new TypeError("Object.defineProperty called on non-object");
  error.stack =
    "TypeError: hidden\n    at sensitiveName (https://private.example/_worker.js:123:456)\n    at privateCall (script:234:567)";
  const failure = pdfFailure(error, "open", hash);
  assert.deepEqual(logger.mock.calls.at(-1)!.arguments[1].probe, {
    version: 1,
    fixture: "bundled-synthetic-contract",
    message: "Object.defineProperty called on non-object",
    locations: [
      { line: 123, column: 456 },
      { line: 234, column: 567 },
    ],
  });
  assert.doesNotMatch(failure.message, /defineProperty|123|456|probe/);
});

test("probe redacts secrets, quotes, URLs, arbitrary identifiers and stack paths", async (t) => {
  const logger = t.mock.method(console, "error", () => {});
  const hash = await fixtureHash();
  for (const message of [
    "secret document contents",
    "Cannot read properties of undefined (reading 'secret-account')",
    "secretIdentifier is not a function",
    "https://private.example/?key=AIzaSecret file:///private/contract.pdf C:\\private\\contract.pdf",
    'Received "patient details" and `secret-key` sb_secret_abc eyJsecret.token.signature',
  ]) {
    const error = new TypeError(message);
    error.stack = `${message}\n    at confidential (/private/filename.js:321:654)\n    at https://private.example/file.js?key=secret:123:456\n    at another (script:777:888)`;
    const failure = pdfFailure(error, "open", hash);
    const diagnostic = logger.mock.calls.at(-1)!.arguments[1];
    assert.deepEqual(diagnostic.probe.locations, [
      { line: 321, column: 654 },
      { line: 777, column: 888 },
    ]);
    assert.doesNotMatch(
      JSON.stringify(diagnostic) + failure.message,
      /secret|private|patient|details|confidential|filename|AIza|eyJ|contract\.pdf/,
    );
  }
});

test("probe bounds diagnostic size and tolerates absent stack", async (t) => {
  const logger = t.mock.method(console, "error", () => {});
  const error = new TypeError("unknown-value ".repeat(10000));
  error.stack = undefined;
  pdfFailure(error, "open", await fixtureHash());
  const probe = logger.mock.calls.at(-1)!.arguments[1].probe;
  assert.ok(probe.message.length < 1000);
  assert.deepEqual(probe.locations, []);
});
