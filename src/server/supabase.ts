import type {
  Account,
  IdentityProvider,
  Session,
  Store,
  Workspace,
} from "./contracts.ts";
import type { DocumentStore, DocumentRecord } from "./documents.ts";
import { HttpError } from "./http.ts";
import type { AnswerStore, AnswerRecord, IndexedChunk } from "./answers.ts";
import type { ActivityStore, ActiveTime } from "./activity.ts";

export interface SupabaseConfig {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}
export function supabaseAdapters(config: SupabaseConfig): {
  store: Store & DocumentStore & AnswerStore & ActivityStore;
  auth: IdentityProvider;
} {
  async function call(
    path: string,
    method = "GET",
    body?: unknown,
    extra: Record<string, string> = {},
  ) {
    const response = await fetch(`${config.SUPABASE_URL}${path}`, {
      method,
      signal: AbortSignal.timeout(15_000),
      headers: {
        apikey: config.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${config.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        ...extra,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) throw new Error("Supabase request failed");
    return response.status === 204 ||
      response.headers.get("content-length") === "0"
      ? null
      : response.json();
  }
  const eq = encodeURIComponent;
  return {
    auth: {
      async account(id) {
        const result = await call(`/auth/v1/admin/users/${eq(id)}`);
        const user = result.user ?? result;
        if (user.id !== id || typeof user.email !== "string")
          throw new Error("Invalid account");
        return {
          id,
          email: user.email,
          name:
            user.user_metadata?.display_name ??
            user.user_metadata?.full_name ??
            "",
          providers: user.app_metadata?.providers ?? [],
        };
      },
      async updateName(id, name) {
        await call(`/auth/v1/admin/users/${eq(id)}`, "PUT", {
          user_metadata: { display_name: name },
        });
      },
      async changePassword(account, currentPassword, password) {
        const session = await call(
          "/auth/v1/token?grant_type=password",
          "POST",
          { email: account.email, password: currentPassword },
        );
        if (
          session.user?.id !== account.id ||
          typeof session.access_token !== "string"
        )
          throw new Error("Invalid credentials");
        await call(
          "/auth/v1/user",
          "PUT",
          { password, current_password: currentPassword },
          { Authorization: `Bearer ${session.access_token}` },
        );
      },
      async googleUrl(redirect, challenge) {
        const settings = await call("/auth/v1/settings");
        if (!settings.external?.google) throw new Error("Google is disabled");
        const url = new URL("/auth/v1/authorize", config.SUPABASE_URL);
        url.searchParams.set("provider", "google");
        url.searchParams.set("redirect_to", redirect);
        url.searchParams.set("code_challenge", challenge);
        url.searchParams.set("code_challenge_method", "s256");
        return url.href;
      },
      async exchangeGoogle(code, verifier) {
        const result = await call("/auth/v1/token?grant_type=pkce", "POST", {
          auth_code: code,
          code_verifier: verifier,
        });
        if (typeof result.access_token !== "string")
          throw new Error("Invalid identity");
        const user = await call("/auth/v1/user", "GET", undefined, {
          Authorization: `Bearer ${result.access_token}`,
        });
        if (typeof user?.id !== "string" || typeof user.email !== "string")
          throw new Error("Invalid identity");
        return { id: user.id, email: user.email };
      },
      async signIn(email, password) {
        const result = await call(
          "/auth/v1/token?grant_type=password",
          "POST",
          { email, password },
        );
        const user = result.user;
        if (typeof user?.id !== "string" || typeof user.email !== "string")
          throw new Error("Invalid identity");
        return { id: user.id, email: user.email } satisfies Account;
      },
      async signUp(email, password) {
        await call("/auth/v1/signup", "POST", { email, password });
      },
    },
    store: {
      async storageSnapshot(ownerId) {
        return await call("/rest/v1/rpc/folio_storage_snapshot", "POST", {
          p_owner: ownerId,
        });
      },
      async admitStorageOperation(ownerId, operation, now) {
        const result = await call(
          "/rest/v1/rpc/folio_admit_storage_operation",
          "POST",
          { p_owner: ownerId, p_operation: operation, p_now: now },
        );
        if (result.error)
          throw new HttpError(result.status, result.error, result.code);
      },
      async reserveUpload(document) {
        const result = await call("/rest/v1/rpc/folio_reserve_upload", "POST", {
          p_document: document,
        });
        if (result.error)
          throw new HttpError(result.status, result.error, result.code);
        return result.document as DocumentRecord | undefined;
      },
      async releaseUpload(id, ownerId) {
        await call("/rest/v1/rpc/folio_release_upload", "POST", {
          p_id: id,
          p_owner: ownerId,
        });
      },
      async recordActiveTime(ownerId, workspaceId, bucket, milliseconds) {
        const result = await call(
          "/rest/v1/rpc/folio_record_active_time",
          "POST",
          {
            p_owner: ownerId,
            p_workspace: workspaceId,
            p_bucket: bucket,
            p_milliseconds: milliseconds,
          },
        );
        if (result.error) throw new HttpError(result.status, result.error);
      },
      async activeTime(ownerId, workspaceId) {
        return (await call("/rest/v1/rpc/folio_active_time", "POST", {
          p_owner: ownerId,
          p_workspace: workspaceId,
        })) as ActiveTime;
      },
      async setDocumentTrashed(id, ownerId, trashed, now) {
        const result = await call(
          "/rest/v1/rpc/folio_set_document_trashed",
          "POST",
          { p_id: id, p_owner: ownerId, p_trashed: trashed, p_now: now },
        );
        if (result.error) throw new HttpError(result.status, result.error);
        return result.document as DocumentRecord;
      },
      async deleteAccountSessions(ownerId) {
        await call(
          `/rest/v1/folio_sessions?owner_id=eq.${eq(ownerId)}`,
          "DELETE",
        );
      },
      async findAnswer(ownerId, requestKey) {
        const rows = await call(
          `/rest/v1/folio_answers?owner_id=eq.${eq(ownerId)}&request_key=eq.${eq(requestKey)}&select=data`,
        );
        return rows[0]?.data as AnswerRecord | undefined;
      },
      async listAnswers(ownerId, workspaceId) {
        const rows = await call(
          `/rest/v1/folio_answers?owner_id=eq.${eq(ownerId)}&workspace_id=eq.${eq(workspaceId)}&select=data&order=created_at.asc`,
        );
        return rows.map((row: { data: AnswerRecord }) => row.data);
      },
      async getIndex(documentId, ownerId, indexKey) {
        const rows = await call(
          `/rest/v1/folio_embeddings?document_id=eq.${eq(documentId)}&owner_id=eq.${eq(ownerId)}&index_key=eq.${eq(indexKey)}&select=data`,
        );
        return rows[0]?.data as IndexedChunk[] | undefined;
      },
      async putIndex(documentId, ownerId, indexKey, chunks) {
        await call(
          "/rest/v1/folio_embeddings?on_conflict=document_id,index_key",
          "POST",
          {
            document_id: documentId,
            owner_id: ownerId,
            index_key: indexKey,
            data: chunks,
          },
          { Prefer: "resolution=merge-duplicates,return=representation" },
        );
      },
      async commitAnswer(answer) {
        const result = await call("/rest/v1/rpc/folio_commit_answer", "POST", {
          p_answer: answer,
        });
        if (result.error) throw new HttpError(result.status, result.error);
        return result.answer as AnswerRecord;
      },
      async getDocument(id, ownerId) {
        const rows = await call(
          `/rest/v1/folio_documents?id=eq.${eq(id)}&owner_id=eq.${eq(ownerId)}&select=data`,
        );
        return rows[0]?.data as DocumentRecord | undefined;
      },
      async findUpload(ownerId, requestKey) {
        const rows = await call(
          `/rest/v1/folio_documents?owner_id=eq.${eq(ownerId)}&request_key=eq.${eq(requestKey)}&select=data`,
        );
        return rows[0]?.data as DocumentRecord | undefined;
      },
      async listDocuments(workspaceId, ownerId) {
        const rows = await call(
          `/rest/v1/folio_documents?workspace_id=eq.${eq(workspaceId)}&owner_id=eq.${eq(ownerId)}&select=data`,
        );
        return rows.map((row: { data: DocumentRecord }) => row.data);
      },
      async usage(ownerId) {
        const rows = await call(
          `/rest/v1/folio_usage?owner_id=eq.${eq(ownerId)}`,
        );
        return rows[0]
          ? {
              uploads: rows[0].uploads,
              answers: rows[0].answers ?? 0,
              processedPages: rows[0].processed_pages,
              storedBytes: rows[0].stored_bytes,
            }
          : { uploads: 0, processedPages: 0, storedBytes: 0, answers: 0 };
      },
      async commitUpload(document) {
        const result = await call("/rest/v1/rpc/folio_commit_upload", "POST", {
          p_document: document,
        });
        if (result.error)
          throw new HttpError(result.status, result.error, result.code);
        return result.document as DocumentRecord;
      },
      async putSession(session) {
        await call(
          "/rest/v1/folio_sessions",
          "POST",
          { hash: session.hash, owner_id: session.account.id, data: session },
          { Prefer: "return=representation" },
        );
      },
      async getSession(hash) {
        const rows = await call(
          `/rest/v1/folio_sessions?hash=eq.${eq(hash)}&select=data`,
        );
        return rows[0]?.data as Session | undefined;
      },
      async deleteSession(hash) {
        await call(`/rest/v1/folio_sessions?hash=eq.${eq(hash)}`, "DELETE");
      },
      async listWorkspaces(ownerId) {
        const rows = await call(
          `/rest/v1/folio_workspaces?owner_id=eq.${eq(ownerId)}&select=data&order=created_at.desc`,
        );
        return rows.map((row: { data: Workspace }) => row.data);
      },
      async getWorkspace(id, ownerId) {
        const rows = await call(
          `/rest/v1/folio_workspaces?id=eq.${eq(id)}&owner_id=eq.${eq(ownerId)}&select=data`,
        );
        return rows[0]?.data as Workspace | undefined;
      },
      async putWorkspace(workspace) {
        await call(
          "/rest/v1/folio_workspaces?on_conflict=id",
          "POST",
          {
            id: workspace.id,
            owner_id: workspace.ownerId,
            created_at: workspace.createdAt,
            data: workspace,
          },
          { Prefer: "resolution=merge-duplicates,return=representation" },
        );
      },
    },
  };
}
