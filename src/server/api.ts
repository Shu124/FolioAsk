import type { IdentityProvider, Store } from "./contracts.ts";
import { bodyJson, hashToken, HttpError, json, requiredText } from "./http.ts";

const SESSION_SECONDS = 24 * 60 * 60;
export function createApi(deps: {
  store: Store;
  auth: IdentityProvider;
  now?: () => number;
}) {
  const { store, auth } = deps;
  const now = deps.now ?? Date.now;
  return async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/api/, "");
    const method = request.method;
    const token =
      request.headers
        .get("cookie")
        ?.split(";")
        .map((s) => s.trim())
        .find((s) => s.startsWith("folio_session="))
        ?.slice("folio_session=".length) ?? "";
    const hash = await hashToken(token);
    const cookie = (value: string, age: number) =>
      `folio_session=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${url.protocol === "https:" ? "; Secure" : ""}`;
    let response: Response;
    try {
      if (
        !["GET", "HEAD"].includes(method) &&
        request.headers.get("origin") !== url.origin
      )
        throw new HttpError(403, "This request must originate from FolioAsk.");
      if (
        (path === "/session" && method === "POST") ||
        (path === "/signup" && method === "POST")
      ) {
        const data = await bodyJson(request);
        const email = requiredText(data.email, "Email", 254).toLowerCase();
        const password = requiredText(data.password, "Password", 256);
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
          throw new HttpError(400, "Enter a valid email address.");
        if (path === "/signup") {
          if (password.length < 12)
            throw new HttpError(
              400,
              "Use at least 12 characters for your password.",
            );
          // Always generic; never reveal whether an email already belongs to an account.
          try {
            await auth.signUp(email, password);
          } catch {
            throw new HttpError(503, "Signup is unavailable. Try again later.");
          }
          response = json(
            {
              message:
                "Check your email to confirm your account, then sign in. If you already have an account, sign in.",
            },
            202,
          );
        } else {
          let account;
          try {
            account = await auth.signIn(email, password);
          } catch {
            throw new HttpError(
              401,
              "Could not sign in. Check your credentials and email confirmation, or try again later.",
            );
          }
          const sessionToken = crypto.randomUUID() + crypto.randomUUID();
          await store.putSession({
            hash: await hashToken(sessionToken),
            account,
            expiresAt: now() + SESSION_SECONDS * 1000,
          });
          response = json({ email: account.email }, 200, {
            "Set-Cookie": cookie(sessionToken, SESSION_SECONDS),
          });
        }
      } else {
        const session = token ? await store.getSession(hash) : undefined;
        if (!session || session.expiresAt <= now())
          throw new HttpError(401, "Sign in to access your workspace.");
        const ownerId = session.account.id;
        if (path === "/session" && method === "GET")
          response = json({ email: session.account.email });
        else if (path === "/session" && method === "DELETE") {
          await store.deleteSession(hash);
          response = new Response(null, {
            status: 204,
            headers: { "Set-Cookie": cookie("", 0) },
          });
        } else if (path === "/workspaces" && method === "GET")
          response = json(await store.listWorkspaces(ownerId));
        else if (path === "/workspaces" && method === "POST") {
          const data = await bodyJson(request);
          const workspace = {
            id: crypto.randomUUID(),
            ownerId,
            name: requiredText(data.name, "Workspace name", 100),
            createdAt: now(),
          };
          await store.putWorkspace(workspace);
          response = json(workspace, 201);
        } else if (
          /^\/workspaces\/[^/]+$/.test(path) &&
          ["GET", "PATCH"].includes(method)
        ) {
          const workspace = await store.getWorkspace(
            path.split("/")[2],
            ownerId,
          );
          if (!workspace) throw new HttpError(404, "Workspace not found.");
          if (method === "PATCH") {
            const data = await bodyJson(request);
            workspace.name = requiredText(data.name, "Workspace name", 100);
            await store.putWorkspace(workspace);
          }
          response = json(workspace);
        } else throw new HttpError(404, "This operation is not available.");
      }
    } catch (error) {
      response =
        error instanceof HttpError
          ? json({ error: error.message }, error.status)
          : json(
              {
                error: "The service is temporarily unavailable. Please retry.",
              },
              503,
            );
    }
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    return response;
  };
}
