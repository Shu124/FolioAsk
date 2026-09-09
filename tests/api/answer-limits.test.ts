import { test } from "node:test";
import assert from "node:assert/strict";
import { createApi } from "../../src/server/api.ts";
import { SqliteStore } from "../../src/server/sqlite-store.ts";
import { samplePdf } from "../fixtures/pdf.ts";
import type { ModelProvider } from "../../src/server/answers.ts";

test("failed and invalid answers cost no allowance, not-found and concurrent successes stop at twenty", async () => {
  const store = new SqliteStore(":memory:");
  const pdf = await samplePdf();
  const hash = Buffer.from(await crypto.subtle.digest("SHA-256", pdf)).toString(
    "hex",
  );
  const provider: ModelProvider = {
    kind: "free",
    indexKey: "controlled",
    embed: async (texts) => texts.map(() => [1, 0]),
    answer: async (question) => {
      if (question === "failure")
        throw new Error("External provider unavailable");
      if (question === "invalid")
        return {
          status: "answered",
          claims: [
            {
              text: "Unsupported claim",
              citations: [{ id: "invented", quote: "invented" }],
            },
          ],
        };
      return { status: "not_found", claims: [] };
    },
  };
  const api = createApi({
    store,
    auth: {
      signIn: async (email) => ({ id: email, email }),
      signUp: async () => {},
    },
    documents: { store, blobs: store, approvedHashes: [hash] },
    answers: { store, provider },
  });
  let cookie = "";
  const call = (path: string, method = "GET", body?: unknown) =>
    api(
      new Request(`http://localhost/api${path}`, {
        method,
        headers: {
          Origin: "http://localhost",
          Cookie: cookie,
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
  try {
    cookie = (
      await call("/session", "POST", {
        email: "limit@example.test",
        password: "test",
      })
    ).headers
      .get("set-cookie")!
      .split(";")[0];
    const workspace = await (
      await call("/workspaces", "POST", { name: "Limits" })
    ).json();
    const uploaded = await api(
      new Request(`http://localhost/api/workspaces/${workspace.id}/documents`, {
        method: "POST",
        headers: {
          Origin: "http://localhost",
          Cookie: cookie,
          "Content-Type": "application/pdf",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: Buffer.from(pdf),
      }),
    );
    const document = await uploaded.json();
    const ask = (question: string, requestKey = crypto.randomUUID()) =>
      call(`/workspaces/${workspace.id}/answers`, "POST", {
        question,
        requestKey,
        documentIds: [document.id],
      });
    assert.equal((await ask("failure")).status, 503);
    assert.equal((await ask("invalid")).status, 502);
    assert.equal((await (await call("/usage")).json()).answersRemaining, 20);
    for (let i = 0; i < 18; i++) {
      const response = await ask("Absent information");
      assert.equal(response.status, 201);
      assert.match(
        (await response.json()).text,
        /could not find supporting information/,
      );
    }
    const concurrent = await Promise.all(
      Array.from({ length: 4 }, () => ask("Absent information")),
    );
    assert.deepEqual(
      concurrent.map((response) => response.status).sort(),
      [201, 201, 429, 429],
    );
    assert.equal((await (await call("/usage")).json()).answersRemaining, 0);
    assert.equal(
      (await (await call(`/workspaces/${workspace.id}/answers`)).json()).length,
      20,
    );
  } finally {
    store.close();
  }
});
