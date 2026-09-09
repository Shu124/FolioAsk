import assert from "node:assert/strict";
import { createApi } from "../src/server/api.ts";
import { freeGemini } from "../src/server/gemini.ts";
import { SqliteStore } from "../src/server/sqlite-store.ts";
import { samplePdf } from "../tests/fixtures/pdf.ts";

if (
  !process.env.GEMINI_FREE_API_KEY ||
  process.env.GEMINI_FREE_PROJECT_CONFIRMED !== "yes"
) {
  console.error(
    "Live check NOT RUN. Configure GEMINI_FREE_API_KEY and GEMINI_FREE_PROJECT_CONFIRMED=yes in ignored .env after verifying the project is on the free tier. Never paste the key into chat.",
  );
  process.exit(2);
}
const store = new SqliteStore(":memory:");
const pdf = await samplePdf();
const approvedHash = Buffer.from(
  await crypto.subtle.digest("SHA-256", pdf),
).toString("hex");
const api = createApi({
  store,
  auth: {
    signIn: async (email) => ({ id: email, email }),
    signUp: async () => {},
  },
  documents: { store, blobs: store, approvedHashes: [approvedHash] },
  answers: { store, provider: freeGemini(process.env.GEMINI_FREE_API_KEY) },
});
let cookie = "";
async function call(path: string, method = "GET", body?: unknown) {
  return api(
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
}
try {
  cookie = (
    await call("/session", "POST", {
      email: "smoke@example.test",
      password: "synthetic-smoke",
    })
  ).headers
    .get("set-cookie")!
    .split(";")[0];
  const workspace = await (
    await call("/workspaces", "POST", { name: "Synthetic Gemini smoke" })
  ).json();
  const upload = await api(
    new Request(
      `http://localhost/api/workspaces/${workspace.id}/documents?name=contract.pdf`,
      {
        method: "POST",
        headers: {
          Origin: "http://localhost",
          Cookie: cookie,
          "Content-Type": "application/pdf",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: Buffer.from(pdf),
      },
    ),
  );
  assert.equal(upload.status, 201);
  const document = await upload.json();
  const started = Date.now();
  const response = await call(`/workspaces/${workspace.id}/answers`, "POST", {
    question: "When are shop drawings due?",
    documentIds: [document.id],
    requestKey: crypto.randomUUID(),
  });
  if (response.status !== 201) {
    const failure = await response.json();
    throw new Error(`Live check failed: ${failure.error}`);
  }
  const answer = await response.json();
  assert.equal(answer.providerMode, "live");
  assert.match(answer.text, /14/);
  assert.ok(answer.citations.length > 0);
  const source = await (await call(`/documents/${document.id}`)).json();
  for (const citation of answer.citations) {
    assert.equal(citation.documentId, document.id);
    assert.ok(
      source.pages[citation.page - 1].passages
        .find(
          (passage: { id: string; text: string }) =>
            passage.id === citation.passageId,
        )
        ?.text.includes(citation.quote),
    );
  }
  assert.equal((await (await call("/usage")).json()).answersRemaining, 19);
  console.log(
    JSON.stringify(
      {
        result: "PASS",
        provider: "Gemini real API",
        fixture: "synthetic contract",
        elapsedMs: Date.now() - started,
        citations: answer.citations.length,
        note: "One smoke case, not an accuracy, cost, performance or compliance evaluation.",
      },
      null,
      2,
    ),
  );
} finally {
  store.close();
}
