import { test } from "node:test";
import assert from "node:assert/strict";
import { createApi } from "../../src/server/api.ts";
import { SqliteStore } from "../../src/server/sqlite-store.ts";
import { samplePdf } from "../fixtures/pdf.ts";

test("ask an owned PDF, recover saved answer and inspect its exact cited evidence", async () => {
  const store = new SqliteStore(":memory:");
  const pdf = await samplePdf();
  const hash = Buffer.from(await crypto.subtle.digest("SHA-256", pdf)).toString(
    "hex",
  );
  const provider = {
    kind: "free" as const,
    indexKey: "controlled-v1",
    embed: async (texts: string[]) => texts.map(() => [1, 0]),
    answer: async (
      _question: string,
      evidence: { id: string; text: string }[],
    ) => ({
      status: "answered",
      claims: [
        {
          text: "Shop drawings are due within 14 calendar days.",
          citations: [
            {
              id: evidence.find((item) =>
                item.text.includes("14 calendar days"),
              )!.id,
              quote: "Shop drawings are due within 14 calendar days.",
            },
          ],
        },
      ],
    }),
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
  const call = (path: string, method = "GET", body?: unknown, cookie = "") =>
    api(
      new Request(`http://localhost/api${path}`, {
        method,
        headers: {
          Origin: "http://localhost",
          "Content-Type": "application/json",
          Cookie: cookie,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
  try {
    const cookie = (
      await call("/session", "POST", {
        email: "alice@example.test",
        password: "fixture-password",
      })
    ).headers
      .get("set-cookie")!
      .split(";")[0];
    const workspace = await (
      await call("/workspaces", "POST", { name: "Q&A" }, cookie)
    ).json();
    const uploaded = await api(
      new Request(
        `http://localhost/api/workspaces/${workspace.id}/documents?name=contract.pdf`,
        {
          method: "POST",
          headers: {
            Origin: "http://localhost",
            "Content-Type": "application/pdf",
            Cookie: cookie,
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: Buffer.from(pdf),
        },
      ),
    );
    const document = await uploaded.json();
    const body = {
      question: "When are shop drawings due?",
      documentIds: [document.id],
      requestKey: crypto.randomUUID(),
    };
    const response = await call(
      `/workspaces/${workspace.id}/answers`,
      "POST",
      body,
      cookie,
    );
    assert.equal(response.status, 201);
    const answer = await response.json();
    assert.match(answer.text, /14 calendar days/);
    assert.equal(answer.citations[0].documentId, document.id);
    assert.equal(answer.citations[0].page, 1);
    const source = await (
      await call(`/documents/${document.id}`, "GET", undefined, cookie)
    ).json();
    assert.equal(
      source.pages[0].passages.find(
        (passage: { id: string }) =>
          passage.id === answer.citations[0].passageId,
      ).text,
      answer.citations[0].quote,
    );
    assert.equal(
      (
        await (
          await call(
            `/workspaces/${workspace.id}/answers`,
            "GET",
            undefined,
            cookie,
          )
        ).json()
      )[0].id,
      answer.id,
    );
    assert.equal(
      (await call(`/workspaces/${workspace.id}/answers`, "POST", body, cookie))
        .status,
      200,
    );
    assert.equal(
      (await (await call("/usage", "GET", undefined, cookie)).json())
        .answersRemaining,
      19,
    );
    const bob = (
      await call("/session", "POST", {
        email: "bob@example.test",
        password: "fixture-password",
      })
    ).headers
      .get("set-cookie")!
      .split(";")[0];
    const bobWorkspace = await (
      await call("/workspaces", "POST", { name: "Bob" }, bob)
    ).json();
    assert.equal(
      (await call(`/workspaces/${bobWorkspace.id}/answers`, "POST", body, bob))
        .status,
      404,
    );
  } finally {
    store.close();
  }
});
