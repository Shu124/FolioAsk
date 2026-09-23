import { bodyJson, HttpError, json, requiredText } from "./http.ts";

export interface Conversation {
  id: string;
  ownerId: string;
  workspaceId: string;
  title: string;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}
export type ConversationChange =
  { title: string } | { archived: boolean } | { deletedAt: number };
export interface ConversationStore {
  listConversations?(
    ownerId: string,
    workspaceId: string,
  ): Promise<Conversation[]>;
  changeConversation?(
    ownerId: string,
    workspaceId: string,
    id: string,
    change: ConversationChange,
  ): Promise<Conversation>;
}
export async function conversationRoute(
  request: Request,
  ownerId: string,
  store: ConversationStore,
  owns: (id: string) => Promise<boolean>,
  now: number,
) {
  const match = new URL(request.url).pathname.match(
    /^\/api\/workspaces\/([^/]+)\/conversations(?:\/([^/]+))?$/,
  );
  if (!match) return;
  const [, workspaceId, id] = match;
  if (!(await owns(workspaceId)))
    throw new HttpError(404, "Workspace not found.");
  if (!store.listConversations || !store.changeConversation)
    throw new HttpError(503, "Conversation management is unavailable.");
  if (!id && request.method === "GET")
    return json(await store.listConversations(ownerId, workspaceId));
  if (!id || !["PATCH", "DELETE"].includes(request.method))
    throw new HttpError(405, "Method not supported.");
  const body = await bodyJson(request);
  let change: ConversationChange;
  if (request.method === "DELETE") {
    if (body.confirm !== true)
      throw new HttpError(
        400,
        "Confirm deletion of this conversation and its saved answers.",
      );
    change = { deletedAt: now };
  } else if (typeof body.title === "string" && body.archived === undefined) {
    change = { title: requiredText(body.title, "Conversation title", 100) };
  } else if (typeof body.archived === "boolean" && body.title === undefined) {
    change = { archived: body.archived };
  } else throw new HttpError(400, "Provide a title or archive state.");
  return json(await store.changeConversation(ownerId, workspaceId, id, change));
}
