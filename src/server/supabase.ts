import type {
  Account,
  IdentityProvider,
  Session,
  Store,
  Workspace,
} from "./contracts.ts";

export interface SupabaseConfig {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}
export function supabaseAdapters(config: SupabaseConfig): {
  store: Store;
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
