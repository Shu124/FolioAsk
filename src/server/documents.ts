import { getDocumentProxy } from "unpdf";
import { HttpError, json } from "./http.ts";

export interface Passage {
  id: string;
  text: string;
  box: { x: number; y: number; width: number; height: number };
}
export interface SourcePage {
  number: number;
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
  classification: "public-approved";
}
export interface Usage {
  uploads: number;
  processedPages: number;
  storedBytes: number;
}
export interface DocumentStore {
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
const MAX_BYTES = 10_000_000;

async function readFile(request: Request) {
  if (Number(request.headers.get("content-length") || 0) > MAX_BYTES)
    throw new HttpError(413, "Free files must be 10 MB or smaller.");
  if (request.headers.get("content-type") !== "application/pdf")
    throw new HttpError(
      415,
      "This upload currently accepts selectable-text PDF files.",
    );
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "Select a PDF to upload.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > MAX_BYTES) {
      await reader.cancel();
      throw new HttpError(413, "Free files must be 10 MB or smaller.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  if (!new TextDecoder().decode(bytes.slice(0, 5)).startsWith("%PDF-"))
    throw new HttpError(422, "This is not a valid PDF.");
  return bytes;
}

async function extractPdf(bytes: Uint8Array): Promise<SourcePage[]> {
  let pdf;
  try {
    pdf = await getDocumentProxy(bytes.slice());
    if (pdf.numPages > 20)
      throw new HttpError(413, "Free files must contain at most 20 pages.");
    const pages: SourcePage[] = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const passages: Passage[] = [];
      for (const item of content.items) {
        if (!("str" in item) || !item.str.trim()) continue;
        const [x, y] = viewport.convertToViewportPoint(
          item.transform[4],
          item.transform[5],
        );
        passages.push({
          id: `p${number}-${passages.length + 1}`,
          text: item.str,
          box: {
            x,
            y: y - item.height,
            width: item.width,
            height: Math.max(item.height, 1),
          },
        });
      }
      if (!passages.length)
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
    return pages;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(
      422,
      "This PDF cannot be read. Use a valid, unencrypted selectable-text PDF.",
    );
  } finally {
    await pdf?.loadingTask.destroy();
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
    return json({
      ...usage,
      uploadsRemaining: Math.max(0, 3 - usage.uploads),
      uploadLimit: 3,
    });
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
    const bytes = await readFile(request);
    const contentHash = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      (value) => value.toString(16).padStart(2, "0"),
    ).join("");
    if (!services.approvedHashes.includes(contentHash))
      throw new HttpError(
        403,
        "Controlled pilot only: use an operator-reviewed, hash-approved public synthetic fixture. Patient records and sensitive or confidential files are excluded.",
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
    if ((await store.usage(ownerId)).uploads >= 3)
      throw new HttpError(
        429,
        "Your 3 lifetime uploads are used. Saved documents remain available.",
      );
    const pages = await extractPdf(bytes);
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
      classification: "public-approved",
    };
    await blobs.put(originalKey, bytes);
    let committed: DocumentRecord;
    try {
      committed = await store.commitUpload(document);
    } catch (error) {
      // A database timeout may follow a successful commit. Never remove a blob
      // unless the store gave a definitive rejection; uncertain writes are reconciled.
      if (error instanceof HttpError) await blobs.delete(originalKey);
      throw error;
    }
    if (committed.id !== id) await blobs.delete(originalKey);
    return json(committed, committed.id === id ? 201 : 200);
  }
  const documentMatch = path.match(/^\/documents\/([^/]+)(\/original)?$/);
  if (documentMatch && request.method === "GET") {
    const document = await store.getDocument(documentMatch[1], ownerId);
    if (!document) throw new HttpError(404, "Document not found.");
    if (!documentMatch[2]) return json(document);
    const bytes = await blobs.get(document.originalKey);
    if (!bytes) throw new HttpError(503, "Original temporarily unavailable.");
    return new Response(bytes.slice().buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="document.pdf"`,
      },
    });
  }
}
