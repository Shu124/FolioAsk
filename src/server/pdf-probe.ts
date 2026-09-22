// Temporary hosted-parser probe. Remove after the Cloudflare failure is resolved.
// Only the exact bundled public synthetic fixture qualifies, never its filename.
const SYNTHETIC_HASH =
  "e3559aee2ecd1508ff5451deac3116cfd4a14d48157bad64a1ed9bc0b2ac5b17";

// Preserve engine terminology, not arbitrary identifiers, values or quotations.
const engineWords = new Set(
  (
    `Cannot cannot read properties property of undefined null reading setting ` +
    `is not a function constructor object iterable string number boolean symbol ` +
    `Invalid invalid value argument arguments must be type The the to from on at ` +
    `Failed failed execute called with incompatible receiver Illegal invocation ` +
    `requires required expected Expected received Received provided parameter ` +
    `Cannot convert convert primitive Cannot assign only getter read-only ` +
    `extensible redefine access before initialization defined supported ` +
    `Object Array ArrayBuffer Uint8Array DataView Promise URL URLSearchParams ` +
    `ReadableStream WritableStream TransformStream DOMMatrix MessageChannel ` +
    `MessagePort Worker structuredClone navigator platform userAgent process ` +
    `getBuiltinModule createRequire import meta url defineProperty defineProperties ` +
    `getOwnPropertyDescriptor getPrototypeOf setPrototypeOf freeze resolve reject ` +
    `withResolvers try includes bind call apply transfer postMessage getDocument ` +
    `getDocumentProxy PDFWorker PDFDocumentLoadingTask setupFakeWorker ` +
    `Cannot perform operation detached buffer ArrayBuffer.prototype ` +
    `WebAssembly compile instantiate disabled unsupported non-object ` +
    `private member an whose class did declare it proxy trap returned false ` +
    `descriptor options enumerable configurable writable detached length byteLength`
  ).split(/\s+/),
);

function redactedMessage(message: string): string {
  return (
    message
      .slice(0, 1000)
      // Remove whole URLs and quoted strings before considering engine words.
      .replace(/(?:https?:\/\/|file:\/\/|[A-Za-z]:[\\/])\S+/g, " [redacted] ")
      .replace(/(['"`]).*?\1/g, " [redacted] ")
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => {
        const term = word.replace(/[.,:;()]+$/g, "");
        return term && term.split(".").every((part) => engineWords.has(part))
          ? term
          : "[redacted]";
      })
      .join(" ")
      .replace(/(?:\[redacted\] ){2,}/g, "[redacted] ")
  );
}

export function syntheticPdfProbe(
  error: unknown,
  stage: string,
  contentHash: string | undefined,
) {
  if (
    contentHash !== SYNTHETIC_HASH ||
    stage !== "open" ||
    !(error instanceof Error)
  )
    return undefined;
  // Never emit the stack header, function names, paths, URLs or query strings.
  const locations = (error.stack ?? "")
    .slice(0, 8000)
    .split("\n")
    .slice(1)
    .flatMap((frame) => {
      const position = frame.match(
        /^\s+at [^?#\r\n]+:(\d{1,7}):(\d{1,7})\)?\s*$/,
      );
      return position
        ? [{ line: Number(position[1]), column: Number(position[2]) }]
        : [];
    })
    .slice(0, 5);
  return {
    version: 1,
    fixture: "bundled-synthetic-contract",
    message: redactedMessage(error.message),
    locations,
  };
}
