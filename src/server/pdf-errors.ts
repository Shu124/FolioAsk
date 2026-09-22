import { HttpError } from "./http.ts";
import { syntheticPdfProbe } from "./pdf-probe.ts";

export type PdfStage = "open" | "page" | "text" | "operators" | "cleanup";

// Fixed labels only. Never return regex captures or raw exception text.
const signatures: ReadonlyArray<readonly [RegExp, string]> = [
  [
    /Cannot read properties of (?:undefined|null) \(reading ['"]includes['"]\)/,
    "missing-includes-receiver",
  ],
  [/Promise\.withResolvers/, "promise-with-resolvers"],
  [/Promise\.try/, "promise-try"],
  [/structuredClone/, "structured-clone"],
  [/DOMMatrix/, "dom-matrix"],
  [/MessageChannel|MessagePort/, "message-channel"],
  [/getDocument.*not a function/, "get-document-export"],
  [/detached ArrayBuffer|ArrayBuffer.*detached/, "detached-buffer"],
  [
    /Cannot assign to read only|Cannot set property.*only a getter/,
    "readonly-property",
  ],
  [/object is not extensible|Cannot redefine property/, "immutable-object"],
  [
    /Illegal invocation|incorrect.*this|incompatible receiver/,
    "invalid-receiver",
  ],
];

function runtimeTypes() {
  const typeOf = (read: () => unknown) => {
    try {
      return typeof read();
    } catch {
      return "unavailable";
    }
  };
  return {
    domMatrix: typeOf(() => globalThis.DOMMatrix),
    messageChannel: typeOf(() => globalThis.MessageChannel),
    navigatorPlatform: typeOf(() => globalThis.navigator?.platform),
    navigatorUserAgent: typeOf(() => globalThis.navigator?.userAgent),
    promiseWithResolvers: typeOf(() => Reflect.get(Promise, "withResolvers")),
    readableStream: typeOf(() => globalThis.ReadableStream),
    structuredClone: typeOf(() => globalThis.structuredClone),
    worker: typeOf(() => globalThis.Worker),
  };
}

/** Never log the exception itself: parser messages may contain document data. */
export function pdfFailure(
  error: unknown,
  stage: PdfStage,
  contentHash?: string,
): HttpError {
  const name = error instanceof Error ? error.name : "";
  if (name === "PasswordException" || name === "InvalidPDFException")
    return new HttpError(
      422,
      "This PDF cannot be read. Use a valid, unencrypted selectable-text PDF.",
      "PDF_INVALID",
    );

  const message = error instanceof Error ? error.message : "";
  const category =
    /bundle could not be resolved|PDF.js could not be resolved|No such module|Cannot find module/.test(
      message,
    )
      ? "module-load"
      : /Code generation from strings disallowed|EvalError|eval\(\)|new Function/.test(
            message,
          )
        ? "runtime-code-generation"
        : name === "ReferenceError"
          ? "missing-runtime-api"
          : name === "TypeError"
            ? "runtime-type"
            : "unexpected";
  const reference = crypto.randomUUID();
  const signature =
    signatures.find(([pattern]) => pattern.test(message))?.[1] ??
    "unclassified";
  const probe = syntheticPdfProbe(error, stage, contentHash);
  console.error("[folioask:pdf-failure]", {
    reference,
    stage,
    category,
    signature,
    runtime: runtimeTypes(),
    ...(probe ? { probe } : {}),
  });
  return new HttpError(
    503,
    `PDF processing is temporarily unavailable. Your upload allowance was not used. Contact support with reference ${reference}. Diagnostic: ${stage}/${signature}.`,
    "PDF_PROCESSING_UNAVAILABLE",
  );
}
