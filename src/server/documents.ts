import { getDocumentProxy } from "unpdf";
import { HttpError, json } from "./http.ts";
import { pdfFailure, type PdfStage } from "./pdf-errors.ts";
import {
  DOCUMENT_FORMATS,
  documentFormat,
  MAX_DOCUMENT_PAGES,
  MAX_DOCUMENT_TEXT,
  PRIVATE_DOCUMENT_NOTICE,
  PUBLIC_CONSENT,
  type DocumentFormat,
} from "../document-policy.ts";
import { EXTRACTION_NOTICES, extractOfficeOrText } from "./text-documents.ts";
import { PILOT_ENTITLEMENTS, planUsage } from "./entitlements.ts";
import type { StorageGuardStore } from "./storage-limits.ts";

export interface Passage {
  id: string;
  text: string;
  box: { x: number; y: number; width: number; height: number };
}
export interface SourcePage {
  number: number;
  /** Non-PDF references describe extracted sections or worksheet rows, not print pages. */
  label?: string;
  width: number;
  height: number;
  passages: Passage[];
}
export interface DocumentRecord {
  id: string;
  ownerId: string;
  workspaceId: string;
  name: string;
  contentHash: string;
  requestKey: string;
  originalKey: string;
  bytes: number;
  pages: SourcePage[];
  createdAt: number;
  deletedAt?: number;
  classification: "public-approved" | "public-declared" | "private";
  publicConsent?: typeof PUBLIC_CONSENT;
  /** Missing on legacy records, which are PDFs. */
  format?: DocumentFormat;
  extractionNotice?: string;
}
export interface Usage {
  answers: number;
  uploads: number;
  processedPages: number;
  storedBytes: number;
}
export interface DocumentStore extends StorageGuardStore {
  setDocumentTrashed(
    id: string,
    ownerId: string,
    trashed: boolean,
    now: number,
  ): Promise<DocumentRecord>;
  getDocument(id: string, ownerId: string): Promise<DocumentRecord | undefined>;
  findUpload(
    ownerId: string,
    requestKey: string,
  ): Promise<DocumentRecord | undefined>;
  listDocuments(
    workspaceId: string,
    ownerId: string,
  ): Promise<DocumentRecord[]>;
  usage(ownerId: string): Promise<Usage>;
  commitUpload(document: DocumentRecord): Promise<DocumentRecord>;
}
export interface BlobStore {
  put(key: string, bytes: Uint8Array): Promise<void>;
  get(key: string): Promise<Uint8Array | undefined>;
  delete(key: string): Promise<void>;
}
export interface DocumentServices {
  store: DocumentStore;
  blobs: BlobStore;
  approvedHashes: string[];
}
const MAX_BYTES = PILOT_ENTITLEMENTS.fileBytes;

async function readFile(request: Request, format: DocumentFormat) {
  if (Number(request.headers.get("content-length") || 0) > MAX_BYTES)
    throw new HttpError(413, "Free files must be 30 MB or smaller.");
  const mime = request.headers
    .get("content-type")
    ?.split(";")[0]
    .trim()
    .toLowerCase();
  if (
    mime !== DOCUMENT_FORMATS[format] &&
    mime !== "application/octet-stream" &&
    !(mime === "text/plain" && ["csv", "md"].includes(format)) &&
    !(format === "csv" && mime === "application/vnd.ms-excel")
  )
    throw new HttpError(
      415,
      "The file type does not match its filename. Use PDF, DOCX, XLSX, CSV, TXT or MD.",
    );
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "Select a document to upload.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > MAX_BYTES) {
      await reader.cancel();
      throw new HttpError(413, "Free files must be 30 MB or smaller.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  if (!length) throw new HttpError(422, "This document is empty.");
  if (
    format === "pdf" &&
    !new TextDecoder().decode(bytes.subarray(0, 5)).startsWith("%PDF-")
  )
    throw new HttpError(422, "This is not a valid PDF.");
  return bytes;
}

async function extractPdf(
  bytes: Uint8Array,
  contentHash: string,
): Promise<SourcePage[]> {
  let pdf;
  let stage: PdfStage = "open";
  try {
    pdf = await getDocumentProxy(bytes.slice());
    if (pdf.numPages > MAX_DOCUMENT_PAGES)
      throw new HttpError(413, "PDFs must contain at most 100 pages.");
    const pages: SourcePage[] = [];
    let characters = 0,
      passageCount = 0;
    for (let number = 1; number <= pdf.numPages; number++) {
      stage = "page";
      const page = await pdf.getPage(number);
      const viewport = page.getViewport({ scale: 1 });
      stage = "text";
      const content = await page.getTextContent();
      const passages: Passage[] = [];
      for (const item of content.items) {
        if (!("str" in item) || !item.str.trim()) continue;
        characters += item.str.length;
        if (characters > MAX_DOCUMENT_TEXT || ++passageCount > 20_000)
          throw new HttpError(
            413,
            "This document has too much extracted text. Split it into smaller files (maximum 200,000 text characters per file).",
          );
        const [a, b, c, d, x0, y0] = item.transform;
        const horizontal = Math.hypot(a, b) || 1;
        const vertical = Math.hypot(c, d) || 1;
        const dx = [
          (a / horizontal) * item.width,
          (b / horizontal) * item.width,
        ];
        const dy = [(c / vertical) * item.height, (d / vertical) * item.height];
        const corners = [
          [x0, y0],
          [x0 + dx[0], y0 + dx[1]],
          [x0 + dy[0], y0 + dy[1]],
          [x0 + dx[0] + dy[0], y0 + dx[1] + dy[1]],
        ].map(([x, y]) => viewport.convertToViewportPoint(x, y));
        const xs = corners.map((point) => point[0]),
          ys = corners.map((point) => point[1]);
        passages.push({
          id: `p${number}-${passages.length + 1}`,
          text: item.str,
          box: {
            x: Math.min(...xs),
            y: Math.min(...ys),
            width: Math.max(1, Math.max(...xs) - Math.min(...xs)),
            height: Math.max(1, Math.max(...ys) - Math.min(...ys)),
          },
        });
      }
      stage = "operators";
      if (!passages.length && (await page.getOperatorList()).fnArray.length > 0)
        throw new HttpError(
          422,
          `Page ${number} has no readable text. Scanned-page support is not enabled yet.`,
        );
      pages.push({
        number,
        width: viewport.width,
        height: viewport.height,
        passages,
      });
    }
    if (!pages.some((page) => page.passages.length))
      throw new HttpError(422, "The PDF has no readable text.");
    return pages;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw pdfFailure(error, stage, contentHash);
  } finally {
    try {
      await pdf?.loadingTask.destroy();
    } catch (error) {
      // Cleanup must not hide the original failure or discard valid extraction.
      pdfFailure(error, "cleanup");
    }
  }
}

export async function documentRoute(
  request: Request,
  ownerId: string,
  services: DocumentServices,
  ownsWorkspace: (id: string) => Promise<boolean>,
  now: number,
): Promise<Response | undefined> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api/, "");
  const { store, blobs } = services;
  if (path === "/usage" && request.method === "GET") {
    const usage = await store.usage(ownerId);
    return json(planUsage(usage, await store.storageSnapshot(ownerId)));
  }
  const workspaceMatch = path.match(/^\/workspaces\/([^/]+)\/documents$/);
  if (workspaceMatch) {
    const workspaceId = workspaceMatch[1];
    if (!(await ownsWorkspace(workspaceId)))
      throw new HttpError(404, "Workspace not found.");
    if (request.method === "GET")
      return json(await store.listDocuments(workspaceId, ownerId));
    if (request.method !== "POST")
      throw new HttpError(405, "Method not supported.");
    const requestKey = request.headers.get("idempotency-key") || "";
    if (!/^[a-zA-Z0-9-]{16,100}$/.test(requestKey))
      throw new HttpError(
        400,
        "A valid Idempotency-Key is required. Retry with the same key.",
      );
    const name = url.searchParams.get("name") || "document.pdf";
    if (name.length > 200 || /[\u0000-\u001f]/.test(name))
      throw new HttpError(400, "Use a filename of at most 200 characters.");
    const privacy = request.headers.get("x-folio-document-privacy");
    if (privacy !== null && privacy !== "public")
      throw new HttpError(
        403,
        PRIVATE_DOCUMENT_NOTICE,
        "PRIVATE_DOCUMENT_UNAVAILABLE",
      );
    const declared =
      privacy === "public" &&
      request.headers.get("x-folio-public-consent") === PUBLIC_CONSENT;
    if (privacy === "public" && !declared)
      throw new HttpError(
        403,
        "Confirm this is public, non-sensitive content with no confidential or personal data before uploading.",
        "PUBLIC_CONSENT_REQUIRED",
      );
    const format = documentFormat(name);
    if (!format)
      throw new HttpError(
        415,
        "Supported formats: PDF, DOCX, XLSX, CSV, TXT and MD. Scans, images, legacy or macro-enabled Office files and PowerPoint are not supported yet.",
      );
    await store.admitStorageOperation(ownerId, "upload", now);
    const bytes = await readFile(request, format);
    const contentHash = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      (value) => value.toString(16).padStart(2, "0"),
    ).join("");
    if (!declared && !services.approvedHashes.includes(contentHash))
      throw new HttpError(
        403,
        "Confirm this is public, non-sensitive content with no confidential or personal data before uploading.",
        "PUBLIC_CONSENT_REQUIRED",
      );
    const previous = await store.findUpload(ownerId, requestKey);
    if (previous) {
      if (
        previous.contentHash !== contentHash ||
        previous.workspaceId !== workspaceId
      )
        throw new HttpError(
          409,
          "This retry key belongs to a different upload.",
        );
      return json(previous, 200);
    }
    const usage = await store.usage(ownerId);
    if (usage.uploads >= PILOT_ENTITLEMENTS.uploads)
      throw new HttpError(
        429,
        "Your 3 lifetime uploads are used. View upgrade options for more capacity. Saved documents remain available.",
        "FREE_UPLOAD_LIMIT",
      );
    // Early rejection saves parsing work; the reservation still enforces the
    // account/global limits transactionally after extraction.
    if (usage.storedBytes + bytes.length > PILOT_ENTITLEMENTS.storageBytes)
      throw new HttpError(
        429,
        "This file exceeds your remaining 30 MB free storage allowance.",
        "FREE_STORAGE_LIMIT",
      );
    const pages =
      format === "pdf"
        ? await extractPdf(bytes, contentHash)
        : extractOfficeOrText(bytes, format);
    const id = crypto.randomUUID();
    const originalKey = `${ownerId}/${id}`;
    const document: DocumentRecord = {
      id,
      ownerId,
      workspaceId,
      name,
      contentHash,
      requestKey,
      originalKey,
      bytes: bytes.length,
      pages,
      createdAt: now,
      classification: declared ? "public-declared" : "public-approved",
      ...(declared ? { publicConsent: PUBLIC_CONSENT } : {}),
      format,
      ...(EXTRACTION_NOTICES[format]
        ? { extractionNotice: EXTRACTION_NOTICES[format] }
        : {}),
    };
    const replay = await store.reserveUpload(document);
    if (replay) return json(replay, 200);
    // Reservations have no automatic expiry: a failed/ambiguous storage write
    // can still leave an object. Keep its capacity charged until reconciliation.
    await blobs.put(originalKey, bytes);
    let committed: DocumentRecord;
    try {
      committed = await store.commitUpload(document);
    } catch (error) {
      // A database timeout may follow a successful commit. Never remove a blob
      // unless the store gave a definitive rejection; uncertain writes are reconciled.
      if (error instanceof HttpError) {
        await blobs.delete(originalKey);
        await store.releaseUpload(id, ownerId);
      }
      throw error;
    }
    if (committed.id !== id) {
      await blobs.delete(originalKey);
      await store.releaseUpload(id, ownerId);
    }
    return json(committed, committed.id === id ? 201 : 200);
  }
  const mutation = path.match(/^\/documents\/([^/]+)(\/restore)?$/);
  if (
    mutation &&
    ((!mutation[2] && request.method === "DELETE") ||
      (mutation[2] && request.method === "POST"))
  ) {
    return json(
      await store.setDocumentTrashed(mutation[1], ownerId, !mutation[2], now),
    );
  }
  const documentMatch = path.match(/^\/documents\/([^/]+)(\/original)?$/);
  if (documentMatch && request.method === "GET") {
    const document = await store.getDocument(documentMatch[1], ownerId);
    if (!document) throw new HttpError(404, "Document not found.");
    if (!documentMatch[2]) return json(document);
    if (document.deletedAt !== undefined)
      throw new HttpError(
        410,
        "This document is in Trash. Restore it from Documents first.",
      );
    await store.admitStorageOperation(ownerId, "read", now);
    const bytes = await blobs.get(document.originalKey);
    if (!bytes) throw new HttpError(503, "Original temporarily unavailable.");
    return new Response(bytes.slice().buffer, {
      headers: {
        "Content-Type": DOCUMENT_FORMATS[document.format ?? "pdf"],
        "Content-Disposition": `attachment; filename="document.${document.format ?? "pdf"}"; filename*=UTF-8''${encodeURIComponent(document.name).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16)}`)}`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
}
