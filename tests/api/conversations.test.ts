import { test } from "node:test";
import assert from "node:assert/strict";
import { createApi } from "../../src/server/api.ts";
import { SqliteStore } from "../../src/server/sqlite-store.ts";
import { samplePdf } from "../fixtures/pdf.ts";
import type { ModelProvider } from "../../src/server/answers.ts";

test("conversations persist, isolate follow-up context, and preserve retry identity", async () => {
  const store = new SqliteStore(":memory:");
  const pdf = await samplePdf();
  const hash = Buffer.from(await crypto.subtle.digest("SHA-256", pdf)).toString(
    "hex",
  );
  const provider: ModelProvider = {
    kind: "free",
    indexKey: "conversation-test",
    async embed(texts) {
      return texts.map(() => [1, 0]);
    },
    async answer(question, evidence, history = []) {
      const source = evidence.find((item) =>
        item.text.includes("14 calendar days"),
      )!;
      return {
        status: "answered",
        claims: [
          {
            text: history.length
              ? `Following up on: ${history[0].question}`
              : question,
            citations: [{ id: source.id, quote: source.text }],
          },
        ],
      };
    },
  };
  const api = createApi({
    store,
    auth: {
      async signIn(email) {
        return { id: email, email };
      },
      async signUp() {},
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
          Cookie: cookie,
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
  try {
    const login = await call("/session", "POST", {
      email: "alice@example.test",
      password: "test-password",
    });
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    const project = await (
      await call("/workspaces", "POST", { name: "Research" }, cookie)
    ).json();
    const uploaded = await api(
      new Request(
        `http://localhost/api/workspaces/${project.id}/documents?name=contract.pdf`,
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
    const document = await uploaded.json();
    const path = `/workspaces/${project.id}/answers`;
    const ask = (
      question: string,
      threadId?: string,
      requestKey = crypto.randomUUID(),
    ) => ({ question, threadId, requestKey, documentIds: [document.id] });
    const first = await (
      await call(path, "POST", ask("When are shop drawings due?"), cookie)
    ).json();
    assert.equal(first.threadId, first.id);
    const followupBody = ask("Is that calendar days?", first.threadId);
    const followup = await (
      await call(path, "POST", followupBody, cookie)
    ).json();
    assert.equal(followup.text, "Following up on: When are shop drawings due?");
    assert.equal(followup.threadId, first.threadId);
    assert.equal(
      (await (await call(path, "POST", followupBody, cookie)).json()).id,
      followup.id,
    );
    const separate = await (
      await call(path, "POST", ask("Separate research"), cookie)
    ).json();
    assert.equal(separate.text, "Separate research");
    assert.notEqual(separate.threadId, first.threadId);
    assert.equal(
      (
        await call(
          path,
          "POST",
          { ...followupBody, threadId: separate.threadId },
          cookie,
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await call(
          path,
          "POST",
          ask("Unknown conversation", crypto.randomUUID()),
          cookie,
        )
      ).status,
      404,
    );
    const saved = await (await call(path, "GET", undefined, cookie)).json();
    assert.equal(
      saved.filter(
        (item: { threadId: string }) => item.threadId === first.threadId,
      ).length,
      2,
    );
    const other = await (
      await call("/workspaces", "POST", { name: "Other" }, cookie)
    ).json();
    assert.equal(
      (
        await call(
          `/workspaces/${other.id}/answers`,
          "POST",
          ask("Cross-project", first.threadId),
          cookie,
        )
      ).status,
      404,
    );
  } finally {
    store.close();
  }
});
