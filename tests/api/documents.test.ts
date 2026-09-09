import { test } from "node:test";
import assert from "node:assert/strict";
import { createApi } from "../../src/server/api.ts";
import { SqliteStore } from "../../src/server/sqlite-store.ts";
import { samplePdf, specialPdf } from "../fixtures/pdf.ts";

async function setup(approvedFiles: Uint8Array[]) {
  const store = new SqliteStore(":memory:");
  const approvedHashes = await Promise.all(
    approvedFiles.map(async (file) =>
      Buffer.from(await crypto.subtle.digest("SHA-256", file.slice())).toString(
        "hex",
      ),
    ),
  );
  const api = createApi({
    store,
    auth: {
      signIn: async (email) => ({ id: email, email }),
      signUp: async () => {},
    },
    documents: { store, blobs: store, approvedHashes },
  });
  const request = (path: string, method = "GET", body?: unknown, cookie = "") =>
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
  const login = async (email: string) =>
    (
      await request("/session", "POST", { email, password: "fixture-password" })
    ).headers
      .get("set-cookie")!
      .split(";")[0];
  const alice = await login("alice@example.test");
  const workspace = await (
    await request("/workspaces", "POST", { name: "Project" }, alice)
  ).json();
  const upload = (
    file: Uint8Array,
    key = crypto.randomUUID(),
    cookie = alice,
  ) =>
    api(
      new Request(
        `http://localhost/api/workspaces/${workspace.id}/documents?name=contract.pdf`,
        {
          method: "POST",
          headers: {
            Origin: "http://localhost",
            Cookie: cookie,
            "Content-Type": "application/pdf",
            "Idempotency-Key": key,
          },
          body: Buffer.from(file),
        },
      ),
    );
  return { store, request, login, alice, workspace, upload };
}

test("owned text PDF upload preserves original, page evidence and remaining allowance", async () => {
  const pdf = await samplePdf();
  const { store, request, alice, workspace, upload, login } = await setup([
    pdf,
  ]);
  try {
    const response = await upload(pdf);
    assert.equal(response.status, 201);
    const document = await response.json();
    assert.equal(document.pages.length, 1);
    assert.match(
      document.pages[0].passages
        .map((passage: { text: string }) => passage.text)
        .join("\n"),
      /within 14 calendar days/,
    );
    assert.ok(document.pages[0].passages[0].box.width > 0);
    assert.equal(
      (await (await request("/usage", "GET", undefined, alice)).json())
        .uploadsRemaining,
      2,
    );
    assert.equal(
      (
        await (
          await request(
            `/workspaces/${workspace.id}/documents`,
            "GET",
            undefined,
            alice,
          )
        ).json()
      ).length,
      1,
    );
    const original = await request(
      `/documents/${document.id}/original`,
      "GET",
      undefined,
      alice,
    );
    assert.equal(original.status, 200);
    assert.deepEqual(
      Buffer.from(await original.arrayBuffer()),
      Buffer.from(pdf),
    );
    const bob = await login("bob@example.test");
    for (const path of [
      `/documents/${document.id}`,
      `/documents/${document.id}/original`,
      `/workspaces/${workspace.id}/documents`,
    ])
      assert.equal((await request(path, "GET", undefined, bob)).status, 404);
  } finally {
    store.close();
  }
});

test("rotated passages follow page orientation and blank separators retain page numbering", async () => {
  const rotated = await specialPdf("rotated");
  const blank = await specialPdf("blank");
  const image = await specialPdf("image");
  const { store, upload } = await setup([rotated, blank, image]);
  try {
    const rotatedResponse = await upload(rotated);
    assert.equal(rotatedResponse.status, 201);
    const rotatedDocument = await rotatedResponse.json();
    const passage = rotatedDocument.pages[0].passages[0];
    assert.ok(
      passage.box.height > passage.box.width,
      "The rotated heading must have a vertical footprint",
    );
    const blankResponse = await upload(blank);
    assert.equal(blankResponse.status, 201);
    const blankDocument = await blankResponse.json();
    assert.equal(blankDocument.pages.length, 2);
    assert.equal(blankDocument.pages[1].number, 2);
    assert.deepEqual(blankDocument.pages[1].passages, []);
    assert.equal((await upload(image)).status, 422);
  } finally {
    store.close();
  }
});

test("duplicate and concurrent submissions cannot exceed three lifetime successes", async () => {
  const pdf = await samplePdf();
  const { store, request, alice, upload } = await setup([pdf]);
  try {
    const key = crypto.randomUUID();
    const duplicates = await Promise.all(
      Array.from({ length: 3 }, () => upload(pdf, key)),
    );
    assert.deepEqual(
      duplicates.map((response) => response.status).sort(),
      [200, 200, 201],
    );
    const ids = await Promise.all(
      duplicates.map(async (response) => (await response.json()).id),
    );
    assert.equal(new Set(ids).size, 1);
    const attempts = await Promise.all(
      Array.from({ length: 4 }, () => upload(pdf)),
    );
    assert.deepEqual(
      attempts.map((response) => response.status).sort(),
      [201, 201, 429, 429],
    );
    assert.equal(
      (await (await request("/usage", "GET", undefined, alice)).json()).uploads,
      3,
    );
    assert.equal((await upload(pdf, key)).status, 200);
  } finally {
    store.close();
  }
});

test("page, size, validity and eligibility boundaries preserve failed upload allowance", async () => {
  const valid = await samplePdf(20);
  const long = await samplePdf(21);
  const malformed = new TextEncoder().encode("%PDF-1.7 malformed");
  const changed = await samplePdf(1, "Unreviewed change");
  const { store, request, alice, upload } = await setup([
    valid,
    long,
    malformed,
  ]);
  try {
    assert.equal((await upload(long)).status, 413);
    assert.equal((await upload(malformed)).status, 422);
    assert.equal((await upload(changed)).status, 403);
    const oversized = new Uint8Array(10_000_001);
    oversized.set(valid);
    assert.equal((await upload(oversized)).status, 413);
    assert.equal(
      (await (await request("/usage", "GET", undefined, alice)).json()).uploads,
      0,
    );
    assert.equal((await upload(valid)).status, 201);
    assert.equal(
      (await (await request("/usage", "GET", undefined, alice)).json())
        .processedPages,
      20,
    );
  } finally {
    store.close();
  }
});
