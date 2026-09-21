import type { DocumentStore } from "./documents.ts";
import type { AnswerStore } from "./answers.ts";
import { bodyJson, HttpError, json } from "./http.ts";

export interface ActiveTime {
  milliseconds: number;
  startedAt?: number;
}
export interface ActivityStore {
  recordActiveTime(
    ownerId: string,
    workspaceId: string,
    bucket: number,
    milliseconds: number,
  ): Promise<void>;
  activeTime(ownerId: string, workspaceId: string): Promise<ActiveTime>;
}
export interface ActivityServices {
  store: ActivityStore & DocumentStore & AnswerStore;
}
export interface ProjectActivity {
  counts: {
    documents: number;
    trashed: number;
    answers: number;
    conversations: number;
  };
  activeTime: ActiveTime;
  days: { date: string; uploads: number; answers: number }[];
  recent: {
    id: string;
    label: string;
    at: number;
    documentId?: string;
    threadId?: string;
  }[];
}

export async function activityRoute(
  request: Request,
  ownerId: string,
  services: ActivityServices,
  ownsWorkspace: (id: string) => Promise<boolean>,
  now: number,
): Promise<Response | undefined> {
  const match = new URL(request.url).pathname.match(
    /^\/api\/workspaces\/([^/]+)\/activity$/,
  );
  if (!match) return;
  const workspaceId = match[1];
  if (!(await ownsWorkspace(workspaceId)))
    throw new HttpError(404, "Workspace not found.");
  const { store } = services;
  if (request.method === "POST") {
    const { bucket, milliseconds } = await bodyJson(request);
    if (
      typeof bucket !== "number" ||
      !Number.isSafeInteger(bucket) ||
      bucket % 15000 !== 0 ||
      bucket + 15000 > now ||
      now - bucket > 60000 ||
      typeof milliseconds !== "number" ||
      !Number.isInteger(milliseconds) ||
      milliseconds <= 0 ||
      milliseconds > 15000
    )
      throw new HttpError(
        400,
        "Use a completed recent 15-second interval and at most 15000 active milliseconds.",
      );
    await store.recordActiveTime(ownerId, workspaceId, bucket, milliseconds);
    return json({ saved: true });
  }
  if (request.method !== "GET")
    throw new HttpError(405, "Method not supported.");
  const [documents, answers, activeTime] = await Promise.all([
    store.listDocuments(workspaceId, ownerId),
    store.listAnswers(ownerId, workspaceId),
    store.activeTime(ownerId, workspaceId),
  ]);
  const today = Math.floor(now / 86400000) * 86400000;
  const result: ProjectActivity = {
    counts: {
      documents: documents.filter((d) => d.deletedAt === undefined).length,
      trashed: documents.filter((d) => d.deletedAt !== undefined).length,
      answers: answers.length,
      conversations: new Set(answers.map((a) => a.threadId ?? a.id)).size,
    },
    activeTime,
    days: Array.from({ length: 7 }, (_, index) => {
      const from = today - (6 - index) * 86400000;
      return {
        date: new Date(from).toISOString().slice(0, 10),
        uploads: documents.filter(
          (d) => d.createdAt >= from && d.createdAt < from + 86400000,
        ).length,
        answers: answers.filter(
          (a) => a.createdAt >= from && a.createdAt < from + 86400000,
        ).length,
      };
    }),
    recent: [
      ...documents.map((d) => ({
        id: `upload-${d.id}`,
        label: `Uploaded ${d.name}`,
        at: d.createdAt,
        documentId: d.id,
      })),
      ...documents
        .filter((d) => d.deletedAt !== undefined)
        .map((d) => ({
          id: `trash-${d.id}`,
          label: `In Trash: ${d.name}`,
          at: d.deletedAt!,
          documentId: d.id,
        })),
      ...answers.map((a) => ({
        id: a.id,
        label: a.question,
        at: a.createdAt,
        threadId: a.threadId ?? a.id,
      })),
    ]
      .sort((a, b) => b.at - a.at)
      .slice(0, 20),
  };
  return json(result);
}
