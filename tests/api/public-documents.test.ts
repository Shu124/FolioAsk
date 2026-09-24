import { test } from "node:test";
import assert from "node:assert/strict";
import { createApi } from "../../src/server/api.ts";
import { SqliteStore } from "../../src/server/sqlite-store.ts";
import { samplePdf } from "../fixtures/pdf.ts";
import { controlledProvider } from "../fixtures/provider.ts";
import { officeFixture } from "../fixtures/office.ts";
import { HttpError } from "../../src/server/http.ts";
import type { ModelProvider } from "../../src/server/answers.ts";

async function setup(provider: ModelProvider = controlledProvider) {
  const store = new SqliteStore(":memory:");
  const api = createApi({
    store,
    auth: {
      signIn: async (email) => ({ id: email, email }),
      signUp: async () => {},
    },
    documents: { store, blobs: store, approvedHashes: [] },
    answers: { store, provider },
  });
  let cookie = "";
  const request = (path: string, method = "GET", body?: unknown) =>
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
  const session = await request("/session", "POST", {
    email: "public@example.test",
    password: "fixture-password",
  });
  cookie = session.headers.get("set-cookie")!.split(";")[0];
  const workspace = await (
    await request("/workspaces", "POST", { name: "Real documents" })
  ).json();
  const upload = (
    bytes: Uint8Array,
    name = "report.pdf",
    privacy = "public",
    consent = "public-non-sensitive-v1",
    key = crypto.randomUUID(),
  ) =>
    api(
      new Request(
        `http://localhost/api/workspaces/${workspace.id}/documents?name=${encodeURIComponent(name)}`,
        {
          method: "POST",
          headers: {
            Origin: "http://localhost",
            Cookie: cookie,
            "Content-Type": "application/octet-stream",
            "Idempotency-Key": key,
            "X-Folio-Document-Privacy": privacy,
            "X-Folio-Public-Consent": consent,
          },
          body: Buffer.from(bytes),
        },
      ),
    );
  return { store, request, upload, workspace };
}

test("public real PDFs do not need a hash allowlist and accept 100 pages", async () => {
  const { store, upload, request } = await setup();
  try {
    const result = await upload(await samplePdf(100));
    assert.equal(result.status, 201, await result.clone().text());
    const document = await result.json();
    assert.equal(document.pages.length, 100);
    assert.equal(document.classification, "public-declared");
    assert.equal(document.publicConsent, "public-non-sensitive-v1");
    assert.equal(
      (await request(`/documents/${document.id}/original`)).status,
      200,
    );
    assert.equal((await upload(await samplePdf(101))).status, 413);
  } finally {
    store.close();
  }
});

for (const format of ["docx", "xlsx", "csv", "txt", "md"] as const) {
  test(`public ${format} preserves extracted references and original bytes`, async () => {
    const { store, upload, request, workspace } = await setup();
    try {
      const bytes =
        format === "docx" || format === "xlsx"
          ? officeFixture(format)
          : new TextEncoder().encode(
              format === "csv"
                ? 'Item,Quantity\r\n"Doors, large",12\r\n'
                : "Shop drawings are due within 14 calendar days.\n<script>alert(1)</script>",
            );
      const response = await upload(bytes, `report.${format}`);
      assert.equal(response.status, 201, await response.clone().text());
      const document = await response.json();
      const content = document.pages
        .flatMap((page: { passages: { text: string }[] }) => page.passages)
        .map((passage: { text: string }) => passage.text)
        .join("\n");
      assert.match(
        content,
        format === "xlsx" || format === "csv" ? /Doors/ : /14 calendar days/,
      );
      if (format === "docx") assert.match(content, /Doors 12 units/);
      if (format === "xlsx") assert.match(content, /B2: 24/);
      assert.ok(document.pages[0].label);
      assert.ok(document.extractionNotice);
      const original = await request(`/documents/${document.id}/original`);
      assert.deepEqual(new Uint8Array(await original.arrayBuffer()), bytes);
      assert.match(
        original.headers.get("content-disposition")!,
        /^attachment;/,
      );
      if (["docx", "txt", "md"].includes(format)) {
        const answer = await request(
          `/workspaces/${workspace.id}/answers`,
          "POST",
          {
            documentIds: [document.id],
            question: "When are shop drawings due?",
            requestKey: crypto.randomUUID(),
          },
        );
        assert.equal(answer.status, 201, await answer.clone().text());
        const result = await answer.json();
        assert.equal(result.citations[0].sourceLabel, document.pages[0].label);
        assert.equal(
          result.citations[0].quote,
          "Shop drawings are due within 14 calendar days.",
        );
      }
    } finally {
      store.close();
    }
  });
}

test("malformed, unsupported, oversized expanded and active Office files preserve allowance", async () => {
  const { store, upload, request } = await setup();
  try {
    const cases: [Uint8Array, string, number][] = [
      [new Uint8Array([1, 2, 3]), "bad.docx", 422],
      [new Uint8Array([0, 1, 2]), "bad.txt", 422],
      [new TextEncoder().encode('"unclosed'), "bad.csv", 422],
      [officeFixture("docx"), "bad.xlsx", 422],
      [
        officeFixture("docx", { "word/vbaProject.bin": "macro" }),
        "bad.docx",
        422,
      ],
      [
        officeFixture("docx", {
          "word/document.xml":
            '<!DOCTYPE document [<!ENTITY x "secret">]><document>&x;</document>',
        }),
        "bad.docx",
        422,
      ],
      [
        officeFixture("docx", { "word/document.xml": "x".repeat(4_000_001) }),
        "big.docx",
        413,
      ],
      [
        officeFixture("xlsx", {
          "xl/sharedStrings.xml": `<sst><si><t>${"x".repeat(110_000)}</t></si></sst>`,
          "xl/worksheets/sheet1.xml":
            '<worksheet><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>0</v></c></row></worksheet>',
        }),
        "big.xlsx",
        413,
      ],
      [new TextEncoder().encode("x".repeat(200_001)), "big.txt", 413],
      [new Uint8Array([1]), "legacy.doc", 415],
      [new Uint8Array([1]), "slides.pptx", 415],
      [new Uint8Array([1]), "image.png", 415],
    ];
    for (const [bytes, name, status] of cases) {
      const response = await upload(bytes, name);
      assert.equal(
        response.status,
        status,
        `${name}: ${await response.text()}`,
      );
    }
    const usage = await (await request("/usage")).json();
    assert.equal(usage.uploads, 0);
    assert.equal(usage.storedBytes, 0);
    assert.equal(usage.reservedBytes, 0);
  } finally {
    store.close();
  }
});

test("large indexing resumes durable checkpoints after quota pauses without charging an answer", async () => {
  const embedded: string[] = [];
  let calls = 0;
  const provider: ModelProvider = {
    ...controlledProvider,
    indexKey: "resume-test",
    async embed(texts, task) {
      if (task === "document") {
        if (++calls === 2)
          throw new HttpError(
            429,
            "Shared capacity paused.",
            "AI_CAPACITY_PAUSED",
          );
        embedded.push(...texts);
      }
      return texts.map(() => [1, 0]);
    },
  };
  const { store, upload, request, workspace } = await setup(provider);
  try {
    const bytes = new TextEncoder().encode(
      Array.from(
        { length: 40 },
        (_, i) => `Section ${i}: ${"public words ".repeat(100)}`,
      ).join("\n"),
    );
    const document = await (await upload(bytes, "large.txt")).json();
    const body = {
      question: "What is included?",
      documentIds: [document.id],
      requestKey: crypto.randomUUID(),
    };
    const paused = await request(
      `/workspaces/${workspace.id}/answers`,
      "POST",
      body,
    );
    assert.equal(paused.status, 429);
    assert.match((await paused.json()).error, /Progress is saved/);
    assert.equal((await (await request("/usage")).json()).answers, 0);
    const saved = await store.getIndex(
      document.id,
      document.ownerId,
      "resume-test:bounded-v2",
    );
    assert.ok(saved && saved.length > 0);
    const resumed = await request(
      `/workspaces/${workspace.id}/answers`,
      "POST",
      body,
    );
    assert.equal(resumed.status, 201, await resumed.clone().text());
    const complete = await store.getIndex(
      document.id,
      document.ownerId,
      "resume-test:bounded-v2",
    );
    assert.ok(complete && complete.length > saved.length);
    assert.deepEqual(
      embedded,
      complete.map((chunk) => chunk.text),
      "completed prefix is never embedded twice",
    );
    await store.putIndex(
      document.id,
      document.ownerId,
      "resume-test:bounded-v2",
      saved,
    );
    assert.equal(
      (
        await store.getIndex(
          document.id,
          document.ownerId,
          "resume-test:bounded-v2",
        )
      )?.length,
      complete.length,
    );
    assert.equal(
      await store.getIndex(
        document.id,
        "another-owner",
        "resume-test:bounded-v2",
      ),
      undefined,
    );
    assert.equal((await (await request("/usage")).json()).answers, 1);
  } finally {
    store.close();
  }
});

test("private, uncertain and unacknowledged files never consume upload allowance", async () => {
  const { store, upload, request } = await setup();
  try {
    const bytes = new TextEncoder().encode(
      "A private record must never be parsed.",
    );
    for (const privacy of ["private", "unsure", ""]) {
      const result = await upload(bytes, "report.txt", privacy);
      assert.equal(result.status, 403);
    }
    assert.equal((await upload(bytes, "report.txt", "public", "")).status, 403);
    const usage = await (await request("/usage")).json();
    assert.equal(usage.uploads, 0);
    assert.equal(usage.storedBytes, 0);
    assert.equal(usage.reservedBytes, 0);
  } finally {
    store.close();
  }
});

test("30 MB per file is admitted but fills the unchanged account storage cap", async () => {
  const { store, upload, request } = await setup();
  try {
    const bytes = new Uint8Array(30_000_000).fill(32);
    bytes.set(await samplePdf());
    const result = await upload(bytes);
    assert.equal(result.status, 201, await result.clone().text());
    const usage = await (await request("/usage")).json();
    assert.equal(usage.fileLimitBytes, 30_000_000);
    assert.equal(usage.storageRemainingBytes, 0);
    assert.equal((await upload(await samplePdf())).status, 429);
    assert.equal((await upload(new Uint8Array(30_000_001))).status, 413);
  } finally {
    store.close();
  }
});
