import { defineConfig, loadEnv } from "vite";
import { mkdirSync } from "node:fs";
import { createApi } from "./src/server/api.ts";
import { SqliteStore } from "./src/server/sqlite-store.ts";
import { supabaseAdapters } from "./src/server/supabase.ts";

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ""), ...process.env };
  return {
    plugins: [
      {
        name: "folioask-local-api",
        configureServer(server) {
          const fixtureMode = env.FOLIO_TEST_MODE === "1";
          const configured = env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY;
          let store: SqliteStore | undefined;
          let api: ReturnType<typeof createApi> | undefined;
          if (fixtureMode) {
            mkdirSync(".local", { recursive: true });
            store = new SqliteStore(".local/pilot.sqlite");
            api = createApi({
              store,
              auth: {
                async signIn(email, password) {
                  if (
                    !email.endsWith("@example.test") ||
                    password !== "local-test-password"
                  )
                    throw new Error("Invalid fixture credentials");
                  return { id: email, email };
                },
                async signUp() {
                  throw new Error("Fixture accounts only");
                },
              },
            });
          } else if (configured)
            api = createApi(
              supabaseAdapters({
                SUPABASE_URL: env.SUPABASE_URL!,
                SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY!,
              }),
            );
          server.httpServer?.once("close", () => store?.close());
          server.middlewares.use("/api", async (req, res) => {
            // The fixture identity adapter is only accessible on a loopback dev server.
            if (
              fixtureMode &&
              !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
                req.socket.remoteAddress ?? "",
              )
            ) {
              res.writeHead(403);
              res.end();
              return;
            }
            try {
              const origin = `http://${req.headers.host}`;
              const headers = new Headers();
              for (const [key, value] of Object.entries(req.headers))
                if (value)
                  headers.set(
                    key,
                    Array.isArray(value) ? value.join(", ") : value,
                  );
              const chunks: Uint8Array[] = [];
              let size = 0;
              for await (const chunk of req) {
                size += chunk.length;
                if (size > 16_384) {
                  res.writeHead(413);
                  res.end("Request too large");
                  return;
                }
                chunks.push(chunk);
              }
              const response = api
                ? await api(
                    new Request(`${origin}/api${req.url}`, {
                      method: req.method,
                      headers,
                      body: chunks.length ? Buffer.concat(chunks) : undefined,
                    }),
                  )
                : Response.json(
                    {
                      error:
                        "Sign-in is not configured. Follow the Supabase setup in README; the guided demo is available.",
                    },
                    { status: 503 },
                  );
              response.headers.forEach((value, key) =>
                res.setHeader(key, value),
              );
              res.writeHead(response.status);
              res.end(Buffer.from(await response.arrayBuffer()));
            } catch {
              res.writeHead(503, { "Content-Type": "application/json" });
              res.end(
                JSON.stringify({
                  error: "Local API unavailable. Please retry.",
                }),
              );
            }
          });
        },
      },
    ],
  };
});
