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
      if (question.startsWith("LONG"))
        return {
          status: "answered",
          claims: Array.from({ length: 3 }, () => ({
            text: "x".repeat(1500),
            citations: [{ id: source.id, quote: source.text }],
          })),
        };
      if (question === "Report context limits")
        return {
          status: "answered",
          claims: [
            {
              text: `${history.length}:${history[0].question.length}:${history[0].text.length}`,
              citations: [{ id: source.id, quote: source.text }],
            },
          ],
        };
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
    const upload = async (projectId: string, ownerCookie: string) =>
      (
        await api(
          new Request(
            `http://localhost/api/workspaces/${projectId}/documents?name=contract.pdf`,
            {
              method: "POST",
              headers: {
                Origin: "http://localhost",
                Cookie: ownerCookie,
                "Content-Type": "application/pdf",
                "Idempotency-Key": crypto.randomUUID(),
              },
              body: Buffer.from(pdf),
            },
          ),
        )
      ).json();
    const otherDocument = await upload(other.id, cookie);
    assert.equal(
      (
        await call(
          `/workspaces/${other.id}/answers`,
          "POST",
          {
            ...ask("Cross-project", first.threadId),
            documentIds: [otherDocument.id],
          },
          cookie,
        )
      ).status,
      404,
    );
    const bob = (
      await call("/session", "POST", {
        email: "bob@example.test",
        password: "test-password",
      })
    ).headers
      .get("set-cookie")!
      .split(";")[0];
    const bobProject = await (
      await call("/workspaces", "POST", { name: "Bob project" }, bob)
    ).json();
    const bobDocument = await upload(bobProject.id, bob);
    assert.equal(
      (
        await call(
          `/workspaces/${bobProject.id}/answers`,
          "POST",
          {
            ...ask("Cross-account", first.threadId),
            documentIds: [bobDocument.id],
          },
          bob,
        )
      ).status,
      404,
    );
    assert.deepEqual(
      await (
        await call(
          `/workspaces/${bobProject.id}/answers`,
          "GET",
          undefined,
          bob,
        )
      ).json(),
      [],
    );

    // Arrange a historical fixture without the newly introduced field; assertions stay at the API.
    const legacyId = crypto.randomUUID();
    await store.commitAnswer({
      ...first,
      id: legacyId,
      threadId: undefined,
      requestKey: crypto.randomUUID(),
      question: "Legacy research",
    });
    assert.ok(
      (await (await call(path, "GET", undefined, cookie)).json()).some(
        (answer: { id: string }) => answer.id === legacyId,
      ),
    );
    const legacyFollowup = await (
      await call(path, "POST", ask("Continue old research", legacyId), cookie)
    ).json();
    assert.equal(legacyFollowup.text, "Following up on: Legacy research");
    let longThread: string | undefined;
    for (let index = 0; index < 6; index++) {
      const response = await call(
        path,
        "POST",
        ask(`LONG ${index} ` + "q".repeat(1500), longThread),
        cookie,
      );
      assert.equal(response.status, 201);
      longThread = (await response.json()).threadId;
    }
    const bounded = await (
      await call(path, "POST", ask("Report context limits", longThread), cookie)
    ).json();
    assert.equal(bounded.text, "4:1000:2000");
    const chatsPath = `/workspaces/${project.id}/conversations`;
    const chats = await call(chatsPath, "GET", undefined, cookie);
    assert.equal(chats.status, 200);
    assert.equal(
      (await chats.json()).find((chat: { id: string }) => chat.id === first.id)
        .title,
      first.question,
    );
    const threadPath = `${chatsPath}/${first.id}`;
    assert.equal(
      (await call(threadPath, "PATCH", { title: "Drawing schedule" }, cookie))
        .status,
      200,
    );
    assert.equal(
      (await call(threadPath, "PATCH", { title: " " }, cookie)).status,
      400,
    );
    assert.equal(
      (await call(threadPath, "PATCH", { archived: true }, bob)).status,
      404,
    );
    assert.equal(
      (
        await call(
          `/workspaces/${other.id}/conversations/${first.id}`,
          "DELETE",
          { confirm: true },
          cookie,
        )
      ).status,
      404,
    );
    assert.equal(
      (await call(threadPath, "PATCH", { archived: true }, cookie)).status,
      200,
    );
    assert.equal(
      (await call(path, "POST", ask("Archived followup", first.id), cookie))
        .status,
      409,
    );
    assert.equal(
      (await call(threadPath, "PATCH", { archived: false }, cookie)).status,
      200,
    );
    assert.equal(
      (await (await call(chatsPath, "GET", undefined, cookie)).json()).find(
        (chat: { id: string }) => chat.id === first.id,
      ).title,
      "Drawing schedule",
    );
    const usageBefore = await (
      await call("/usage", "GET", undefined, cookie)
    ).json();
    assert.equal((await call(threadPath, "DELETE", {}, cookie)).status, 400);
    let release!: () => void;
    let started!: () => void;
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const originalAnswer = provider.answer;
    provider.answer = async (...args) => {
      started();
      await gate;
      return originalAnswer(...args);
    };
    const pending = call(
      path,
      "POST",
      ask("Finishing after deletion", first.id),
      cookie,
    );
    await entered;
    assert.equal(
      (await call(threadPath, "DELETE", { confirm: true }, cookie)).status,
      200,
    );
    release();
    assert.equal((await pending).status, 410);
    assert.equal(
      (await call(threadPath, "PATCH", { title: "Resurrect" }, cookie)).status,
      404,
    );
    assert.ok(
      !(await (await call(path, "GET", undefined, cookie)).json()).some(
        (a: { threadId: string }) => a.threadId === first.id,
      ),
    );
    assert.deepEqual(
      await (await call("/usage", "GET", undefined, cookie)).json(),
      usageBefore,
    );
    assert.equal(
      (await call(`/documents/${document.id}`, "GET", undefined, cookie))
        .status,
      200,
    );
    function deferred() {
      let resolve!: () => void;
      const promise = new Promise<void>((done) => {
        resolve = done;
      });
      return { resolve, promise };
    }
    const arrivals = deferred();
    const gates = [deferred(), deferred()];
    let requests = 0;
    provider.answer = async (...args) => {
      const index = requests++;
      if (requests === 2) arrivals.resolve();
      await gates[index].promise;
      return originalAnswer(...args);
    };
    const initialBody = ask("Two pending initial copies");
    const initialOne = call(path, "POST", initialBody, cookie);
    const initialTwo = call(path, "POST", initialBody, cookie);
    await arrivals.promise;
    gates[0].resolve();
    const committed = await Promise.race([initialOne, initialTwo]);
    const committedChat = await committed.json();
    assert.equal(committed.status, 201);
    const afterFirst = await (
      await call("/usage", "GET", undefined, cookie)
    ).json();
    assert.equal(
      (
        await call(
          `${chatsPath}/${committedChat.id}`,
          "DELETE",
          { confirm: true },
          cookie,
        )
      ).status,
      200,
    );
    gates[1].resolve();
    const both = await Promise.all([initialOne, initialTwo]);
    assert.deepEqual(
      both.map((response) => response.status).sort(),
      [201, 410],
    );
    assert.deepEqual(
      await (await call("/usage", "GET", undefined, cookie)).json(),
      afterFirst,
    );
    assert.ok(
      !(await (await call(chatsPath, "GET", undefined, cookie)).json()).some(
        (chat: { title: string }) => chat.title === initialBody.question,
      ),
    );
  } finally {
    store.close();
  }
});
