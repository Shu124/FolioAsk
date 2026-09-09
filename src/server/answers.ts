import type { DocumentRecord, DocumentServices, Passage } from "./documents.ts";
import { bodyJson, hashToken, HttpError, json, requiredText } from "./http.ts";

export interface Evidence {
  id: string;
  documentId: string;
  page: number;
  passageId: string;
  text: string;
  box: Passage["box"];
}
export interface Citation extends Omit<Evidence, "id" | "text"> {
  quote: string;
}
export interface AnswerRecord {
  id: string;
  ownerId: string;
  workspaceId: string;
  documentIds: string[];
  requestKey: string;
  fingerprint: string;
  question: string;
  text: string;
  citations: Citation[];
  createdAt: number;
  providerMode: "simulated" | "live";
}
export interface IndexedChunk {
  text: string;
  evidence: Evidence[];
  vector: number[];
}
export interface AnswerStore {
  findAnswer(
    ownerId: string,
    requestKey: string,
  ): Promise<AnswerRecord | undefined>;
  listAnswers(ownerId: string, workspaceId: string): Promise<AnswerRecord[]>;
  commitAnswer(answer: AnswerRecord): Promise<AnswerRecord>;
  getIndex(
    documentId: string,
    ownerId: string,
    indexKey: string,
  ): Promise<IndexedChunk[] | undefined>;
  putIndex(
    documentId: string,
    ownerId: string,
    indexKey: string,
    chunks: IndexedChunk[],
  ): Promise<void>;
}
export interface ModelProvider {
  kind: "free";
  mode?: "simulated" | "live";
  indexKey: string;
  embed(texts: string[], task: "document" | "query"): Promise<number[][]>;
  answer(question: string, evidence: Evidence[]): Promise<unknown>;
}
export interface AnswerServices {
  store: AnswerStore;
  provider?: ModelProvider;
}

function chunkDocument(
  document: DocumentRecord,
): Omit<IndexedChunk, "vector">[] {
  const chunks: Omit<IndexedChunk, "vector">[] = [];
  for (const page of document.pages) {
    let current: Omit<IndexedChunk, "vector"> = { text: "", evidence: [] };
    for (const passage of page.passages) {
      if (
        current.text.length + passage.text.length > 2400 &&
        current.evidence.length
      ) {
        chunks.push(current);
        current = { text: "", evidence: [] };
      }
      current.text += passage.text + "\n";
      current.evidence.push({
        id: `${document.id}:${passage.id}`,
        documentId: document.id,
        page: page.number,
        passageId: passage.id,
        text: passage.text,
        box: passage.box,
      });
    }
    if (current.evidence.length) chunks.push(current);
  }
  if (chunks.length > 200)
    throw new HttpError(
      422,
      "This document is too dense for the controlled pilot.",
    );
  return chunks;
}
function validVector(vector: unknown): vector is number[] {
  return (
    Array.isArray(vector) &&
    vector.length > 0 &&
    vector.every(
      (value) => typeof value === "number" && Number.isFinite(value),
    ) &&
    vector.some((value) => value !== 0)
  );
}
function similarity(left: number[], right: number[]) {
  if (left.length !== right.length)
    throw new HttpError(
      503,
      "Embedding dimensions changed; processing is paused.",
    );
  let product = 0,
    leftSize = 0,
    rightSize = 0;
  for (let i = 0; i < left.length; i++) {
    product += left[i] * right[i];
    leftSize += left[i] ** 2;
    rightSize += right[i] ** 2;
  }
  return product / Math.sqrt(leftSize * rightSize);
}
async function retrieve(
  document: DocumentRecord,
  question: string,
  services: AnswerServices,
): Promise<Evidence[]> {
  const provider = services.provider!;
  let chunks = await services.store.getIndex(
    document.id,
    document.ownerId,
    provider.indexKey,
  );
  if (!chunks) {
    const raw = chunkDocument(document);
    const vectors = await provider.embed(
      raw.map((chunk) => chunk.text),
      "document",
    );
    if (vectors.length !== raw.length || !vectors.every(validVector))
      throw new HttpError(
        503,
        "Embedding service returned an invalid result. Retry later.",
      );
    chunks = raw.map((chunk, index) => ({ ...chunk, vector: vectors[index] }));
    await services.store.putIndex(
      document.id,
      document.ownerId,
      provider.indexKey,
      chunks,
    );
  }
  const query = (await provider.embed([question], "query"))[0];
  if (!validVector(query))
    throw new HttpError(
      503,
      "Embedding service returned an invalid result. Retry later.",
    );
  return chunks
    .map((chunk) => ({ chunk, score: similarity(chunk.vector, query) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .flatMap(({ chunk }) => chunk.evidence);
}
function validateAnswer(
  value: unknown,
  evidence: Evidence[],
): { text: string; citations: Citation[] } {
  if (!value || typeof value !== "object")
    throw new HttpError(
      502,
      "The answer could not be verified. Retry without losing an answer allowance.",
    );
  const output = value as Record<string, unknown>;
  if (output.status === "not_found")
    return {
      text: "I could not find supporting information in the selected document.",
      citations: [],
    };
  if (
    output.status !== "answered" ||
    !Array.isArray(output.claims) ||
    !output.claims.length ||
    output.claims.length > 12
  )
    throw new HttpError(
      502,
      "The answer could not be verified. Retry without losing an answer allowance.",
    );
  const text: string[] = [];
  const citations: Citation[] = [];
  for (const claim of output.claims) {
    if (
      !claim ||
      typeof claim.text !== "string" ||
      !claim.text.trim() ||
      claim.text.length > 2000 ||
      !Array.isArray(claim.citations) ||
      !claim.citations.length
    )
      throw new HttpError(
        502,
        "The answer is missing valid evidence. Please retry.",
      );
    text.push(claim.text);
    for (const citation of claim.citations) {
      const source = evidence.find((item) => item.id === citation?.id);
      if (
        !source ||
        typeof citation.quote !== "string" ||
        !citation.quote.trim() ||
        !source.text.includes(citation.quote)
      )
        throw new HttpError(
          502,
          "The answer cited unsupported evidence. Please retry.",
        );
      citations.push({
        documentId: source.documentId,
        page: source.page,
        passageId: source.passageId,
        box: source.box,
        quote: citation.quote,
      });
    }
  }
  return { text: text.join("\n\n"), citations };
}
export async function answerRoute(
  request: Request,
  ownerId: string,
  services: AnswerServices,
  documents: DocumentServices,
  ownsWorkspace: (id: string) => Promise<boolean>,
  now: number,
): Promise<Response | undefined> {
  const path = new URL(request.url).pathname;
  const match = path.match(/^\/api\/workspaces\/([^/]+)\/answers$/);
  if (!match) return;
  const workspaceId = match[1];
  if (!(await ownsWorkspace(workspaceId)))
    throw new HttpError(404, "Workspace not found.");
  if (request.method === "GET")
    return json(await services.store.listAnswers(ownerId, workspaceId));
  if (request.method !== "POST")
    throw new HttpError(405, "Method not supported.");
  const data = await bodyJson(request);
  const question = requiredText(data.question, "Question", 2000);
  const requestKey = requiredText(data.requestKey, "Request key", 100);
  if (
    !Array.isArray(data.documentIds) ||
    data.documentIds.length !== 1 ||
    typeof data.documentIds[0] !== "string"
  )
    throw new HttpError(
      400,
      "Select exactly one processed PDF for this slice.",
    );
  const document = await documents.store.getDocument(
    data.documentIds[0],
    ownerId,
  );
  if (!document || document.workspaceId !== workspaceId)
    throw new HttpError(404, "Selected document not found.");
  if (
    document.classification !== "public-approved" ||
    !documents.approvedHashes.includes(document.contentHash)
  )
    throw new HttpError(
      403,
      "This document is not approved for free processing.",
    );
  const fingerprint = await hashToken(
    JSON.stringify({ question, documentId: document.id, workspaceId }),
  );
  const previous = await services.store.findAnswer(ownerId, requestKey);
  if (previous) {
    if (previous.fingerprint !== fingerprint)
      throw new HttpError(
        409,
        "This retry key belongs to a different question.",
      );
    return json(previous);
  }
  if ((await documents.store.usage(ownerId)).answers >= 20)
    throw new HttpError(
      429,
      "Your 20 lifetime answers are used. Saved work remains available.",
    );
  if (!services.provider || services.provider.kind !== "free")
    throw new HttpError(
      503,
      "Free AI is not configured or is paused. Your question is preserved.",
    );
  const evidence = await retrieve(document, question, services);
  const result = validateAnswer(
    await services.provider.answer(question, evidence),
    evidence,
  );
  const record: AnswerRecord = {
    id: crypto.randomUUID(),
    ownerId,
    workspaceId,
    documentIds: [document.id],
    requestKey,
    fingerprint,
    question,
    ...result,
    createdAt: now,
    providerMode: services.provider.mode ?? "simulated",
  };
  const saved = await services.store.commitAnswer(record);
  return json(saved, saved.id === record.id ? 201 : 200);
}
