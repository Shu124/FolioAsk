import { HttpError } from "./http.ts";

export type PdfStage = "open" | "page" | "text" | "operators" | "cleanup";

/** Never log the exception itself: parser messages may contain document data. */
export function pdfFailure(error: unknown, stage: PdfStage): HttpError {
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
  console.error("[folioask:pdf-failure]", { reference, stage, category });
  return new HttpError(
    503,
    `PDF processing is temporarily unavailable. Your upload allowance was not used. Contact support with reference ${reference}.`,
    "PDF_PROCESSING_UNAVAILABLE",
  );
}
