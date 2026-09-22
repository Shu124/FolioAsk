import { test } from "node:test";
import assert from "node:assert/strict";
import { pdfFailure } from "../../src/server/pdf-errors.ts";

test("PDF failures distinguish invalid files from runtime errors without leaking exception data", (t) => {
  const logger = t.mock.method(console, "error", () => {});
  for (const name of ["PasswordException", "InvalidPDFException"]) {
    const error = new Error("private document content");
    error.name = name;
    assert.equal(pdfFailure(error, "open").status, 422);
  }
  assert.equal(logger.mock.callCount(), 0);
  const cases = [
    [
      new Error("Serverless PDF.js bundle could not be resolved: secret"),
      "module-load",
    ],
    [
      new Error("Code generation from strings disallowed: secret"),
      "runtime-code-generation",
    ],
    [new ReferenceError("secret is not defined"), "missing-runtime-api"],
    [new TypeError("private account data"), "runtime-type"],
    [new Error("filename.pdf secret"), "unexpected"],
  ] as const;
  for (const [error, category] of cases) {
    const failure = pdfFailure(error, "text");
    assert.equal(failure.status, 503);
    assert.equal(failure.code, "PDF_PROCESSING_UNAVAILABLE");
    const call = logger.mock.calls.at(-1)!;
    const [prefix, diagnostic] = call.arguments;
    assert.equal(prefix, "[folioask:pdf-failure]");
    assert.deepEqual(Object.keys(diagnostic).sort(), [
      "category",
      "reference",
      "runtime",
      "signature",
      "stage",
    ]);
    assert.equal(diagnostic.category, category);
    assert.equal(diagnostic.stage, "text");
    assert.ok(failure.message.includes(diagnostic.reference));
    assert.doesNotMatch(
      JSON.stringify(call.arguments) + failure.message,
      /secret|private|filename/,
    );
  }
});

test("PDF diagnostics emit only fixed signatures and runtime types", (t) => {
  const logger = t.mock.method(console, "error", () => {});
  const cases = [
    [
      "Cannot read properties of undefined (reading 'includes')",
      "missing-includes-receiver",
    ],
    ["Promise.withResolvers is not a function", "promise-with-resolvers"],
    ["structuredClone is not defined", "structured-clone"],
    ["DOMMatrix is not a constructor", "dom-matrix"],
    [
      "Cannot read properties of undefined (reading 'secret-account')",
      "unclassified",
    ],
    ["secret filename.pdf", "unclassified"],
  ];
  for (const [message, expected] of cases) {
    const failure = pdfFailure(new TypeError(message), "open");
    const diagnostic = logger.mock.calls.at(-1)!.arguments[1];
    assert.equal(diagnostic.signature, expected);
    assert.ok(failure.message.includes(`Diagnostic: open/${expected}`));
    assert.deepEqual(Object.keys(diagnostic.runtime).sort(), [
      "domMatrix",
      "messageChannel",
      "navigatorPlatform",
      "navigatorUserAgent",
      "promiseWithResolvers",
      "readableStream",
      "structuredClone",
      "worker",
    ]);
    for (const type of Object.values(diagnostic.runtime))
      assert.ok(
        [
          "undefined",
          "function",
          "object",
          "string",
          "number",
          "boolean",
          "symbol",
          "bigint",
          "unavailable",
        ].includes(String(type)),
      );
    assert.doesNotMatch(
      JSON.stringify(diagnostic) + failure.message,
      /secret|filename/,
    );
  }
});
