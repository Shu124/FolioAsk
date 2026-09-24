import type { DocumentRecord } from "./server/documents.ts";

export const PUBLIC_CONSENT = "public-non-sensitive-v1";
export const PRIVATE_DOCUMENT_NOTICE =
  "Private, confidential, personal and patient data cannot be uploaded or processed on the free plan. Paid plans are coming soon; no private processing or payment is available yet.";
export const DOCUMENT_FORMATS = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
  txt: "text/plain",
  md: "text/markdown",
} as const;
export type DocumentFormat = keyof typeof DOCUMENT_FORMATS;
export const DOCUMENT_ACCEPT = Object.keys(DOCUMENT_FORMATS)
  .map((type) => `.${type}`)
  .join(",");
export const MAX_DOCUMENT_PAGES = 100;
export const MAX_DOCUMENT_TEXT = 200_000;
export const PASSAGE_CHARACTERS = 1200;
export const SECTION_CHARACTERS = 2400;
// At most 200k text characters, split into <=1200-character fragments,
// plus at most 100 page-end fragments. Keep SQL checkpoint bounds in sync.
export const MAX_INDEX_CHUNKS = 300;

export function documentFormat(name: string): DocumentFormat | undefined {
  const extension = name.toLowerCase().split(".").at(-1);
  return extension && Object.hasOwn(DOCUMENT_FORMATS, extension)
    ? (extension as DocumentFormat)
    : undefined;
}

export function eligibleForFree(
  document: DocumentRecord,
  approvedHashes: string[],
) {
  return (
    (document.classification === "public-declared" &&
      document.publicConsent === PUBLIC_CONSENT) ||
    (document.classification === "public-approved" &&
      approvedHashes.includes(document.contentHash))
  );
}
