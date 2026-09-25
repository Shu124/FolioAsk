import { test } from "node:test";
import assert from "node:assert/strict";
import { createApi } from "../../src/server/api.ts";
import { SqliteStore } from "../../src/server/sqlite-store.ts";
import { HttpError } from "../../src/server/http.ts";
import type { BlobStore } from "../../src/server/documents.ts";
import type { PlanUsage } from "../../src/server/entitlements.ts";
import type { StoragePolicy } from "../../src/server/storage-limits.ts";
import { samplePdf } from "../fixtures/pdf.ts";

async function setup(policy: Partial<StoragePolicy> = {}, padded = false) {
  const original = await samplePdf();
  const pdf = padded ? new Uint8Array(10_000_000) : original;
  if (padded) {
    pdf.fill(32);
    pdf.set(original);
  }
  const store = new SqliteStore(":memory:", policy);
  let puts = 0,
    gets = 0;
  const blobs: BlobStore = {
    put: async (key, bytes) => {
      puts++;
      await store.put(key, bytes);
    },
    get: async (key) => {
      gets++;
      return store.get(key);
    },
    delete: (key) => store.delete(key),
  };
  let now = Date.UTC(2026, 0, 1);
  const api = createApi({
    store,
    now: () => now,
    auth: {
      signIn: async (email) => ({ id: email, email }),
      signUp: async () => {},
    },
    documents: {
      store,
      blobs,
      approvedHashes: [
        Buffer.from(
          await crypto.subtle.digest("SHA-256", pdf.slice()),
        ).toString("hex"),
      ],
    },
  });
  const request = (path: string, cookie = "", method = "GET", body?: unknown) =>
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
  async function account(email: string) {
    const login = await request("/session", "", "POST", {
      email,
      password: "test-password",
    });
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    const workspace = await (
      await request("/workspaces", cookie, "POST", { name: "Quota test" })
    ).json();
    return {
      cookie,
      workspace,
      usage: async (): Promise<PlanUsage> =>
        (await request("/usage", cookie)).json(),
      upload: (key: string = crypto.randomUUID()) =>
        api(
          new Request(
            `http://localhost/api/workspaces/${workspace.id}/documents?name=test.pdf&plan=paid`,
            {
              method: "POST",
              headers: {
                Origin: "http://localhost",
                Cookie: cookie,
                "Content-Type": "application/pdf",
                "Idempotency-Key": key,
                "X-Plan": "paid",
              },
              body: Buffer.from(pdf),
            },
          ),
        ),
    };
  }
  return {
    store,
    blobs,
    pdf,
    account,
    request,
    writes: () => puts,
    reads: () => gets,
    advance: (milliseconds: number) => {
      now += milliseconds;
    },
  };
}

test("three 10 MB originals fill the free allowance; a forged paid plan never bypasses it", async () => {
  const h = await setup({}, true);
  try {
    const alice = await h.account("alice@example.test");
    for (let i = 0; i < 3; i++)
      assert.equal((await alice.upload()).status, 201);
    const usage = await alice.usage();
    assert.equal(usage.storedBytes, 30_000_000);
    assert.equal(usage.storageRemainingBytes, 0);
    assert.equal(usage.uploadsRemaining, 0);
    assert.equal(usage.plan, "free");
    assert.equal(usage.checkoutEnabled, false);
    const denied = await alice.upload();
    assert.equal(denied.status, 429);
    assert.equal((await denied.json()).code, "FREE_UPLOAD_LIMIT");
    assert.equal(h.writes(), 3, "a rejected upload never reaches R2");
    assert.equal(
      (
        await h.request("/usage", alice.cookie, "PATCH", {
          plan: "paid",
          storageLimitBytes: 999999999,
        })
      ).status,
      404,
    );
    assert.equal((await alice.usage()).storageLimitBytes, 30_000_000);
  } finally {
    h.store.close();
  }
});

test("in-flight uploads reserve slots before writing and duplicate requests cannot write a second object", async () => {
  const h = await setup();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let third!: () => void;
  const ready = new Promise<void>((resolve) => {
    third = resolve;
  });
  const write = h.blobs.put;
  let entered = 0;
  h.blobs.put = async (key, bytes) => {
    if (++entered === 3) third();
    await gate;
    await write(key, bytes);
  };
  try {
    const alice = await h.account("alice@example.test");
    const key = crypto.randomUUID();
    const pending = [alice.upload(key), alice.upload(), alice.upload()];
    await ready;
    const before = await alice.usage();
    assert.equal(before.reservedUploads, 3);
    assert.equal(before.uploadsRemaining, 0);
    assert.equal(before.reservedBytes, h.pdf.length * 3);
    const duplicate = await alice.upload(key);
    assert.equal(duplicate.status, 409);
    assert.equal((await duplicate.json()).code, "UPLOAD_IN_PROGRESS");
    assert.equal((await alice.upload()).status, 429);
    assert.equal(entered, 3);
    release();
    assert.deepEqual(
      (await Promise.all(pending)).map((r) => r.status),
      [201, 201, 201],
    );
    assert.equal((await alice.usage()).reservedBytes, 0);
    assert.equal((await alice.upload(key)).status, 200);
    assert.equal(h.writes(), 3);
  } finally {
    release();
    h.store.close();
  }
});

test("the shared storage ceiling covers separate accounts and Trash never returns capacity", async () => {
  const pdf = await samplePdf();
  const h = await setup({ totalBytes: pdf.length });
  try {
    const alice = await h.account("alice@example.test"),
      bob = await h.account("bob@example.test");
    const saved = await (await alice.upload()).json();
    assert.equal(
      (await h.request(`/documents/${saved.id}`, alice.cookie, "DELETE"))
        .status,
      200,
    );
    assert.equal((await alice.usage()).storedBytes, pdf.length);
    const denied = await bob.upload();
    assert.equal(denied.status, 503);
    assert.equal((await denied.json()).code, "STORAGE_PAUSED");
    assert.equal((await bob.usage()).uploadsPaused, true);
    assert.equal(h.writes(), 1);
    assert.equal(
      (
        await h.request(
          `/documents/${saved.id}/restore`,
          alice.cookie,
          "POST",
          {},
        )
      ).status,
      200,
    );
    assert.equal(
      (await h.request(`/documents/${saved.id}/original`, alice.cookie)).status,
      200,
    );
    assert.equal(
      (await h.request(`/documents/${saved.id}/original`, bob.cookie)).status,
      404,
    );
  } finally {
    h.store.close();
  }
});

test("external inventory and the operator pause are counted before any object write", async () => {
  for (const policy of [
    { totalBytes: 10, externalBytes: 10 },
    { uploadsEnabled: false },
  ]) {
    const h = await setup(policy);
    try {
      const alice = await h.account("alice@example.test");
      assert.equal((await alice.upload()).status, 503);
      assert.equal(h.writes(), 0);
      assert.equal((await alice.usage()).uploads, 0);
    } finally {
      h.store.close();
    }
  }
});

test("ambiguous writes retain reserved capacity; confirmed rejection and deletion release it", async () => {
  for (const failure of ["put", "commit", "rejected"] as const) {
    const h = await setup();
    const write = h.blobs.put;
    if (failure === "put")
      h.blobs.put = async (key, bytes) => {
        await write(key, bytes);
        throw new Error("write response lost");
      };
    else
      h.store.commitUpload = async () => {
        throw failure === "commit"
          ? new Error("database response lost")
          : new HttpError(409, "definitive rejection");
      };
    try {
      const alice = await h.account("alice@example.test");
      const key = crypto.randomUUID();
      assert.equal(
        (await alice.upload(key)).status,
        failure === "rejected" ? 409 : 503,
      );
      const usage = await alice.usage();
      assert.equal(usage.uploads, 0);
      assert.equal(
        usage.reservedBytes,
        failure === "rejected" ? 0 : h.pdf.length,
      );
      if (failure !== "rejected") {
        assert.equal((await alice.upload(key)).status, 409);
        assert.equal(h.writes(), 1);
      }
    } finally {
      h.store.close();
    }
  }
});

test("per-account upload/read throttles and shared monthly budgets reject before blob operations", async () => {
  const h = await setup({
    uploadsPerMinute: 1,
    readsPerMinute: 1,
    monthlyUploads: 2,
    monthlyReads: 2,
  });
  try {
    let alice = await h.account("alice@example.test");
    const bob = await h.account("bob@example.test");
    const saved = await (await alice.upload()).json();
    assert.equal((await alice.upload()).status, 429);
    assert.equal(h.writes(), 1);
    assert.equal(
      (await h.request(`/documents/${saved.id}/original`, alice.cookie)).status,
      200,
    );
    assert.equal(
      (await h.request(`/documents/${saved.id}/original`, alice.cookie)).status,
      429,
    );
    h.advance(60_000);
    assert.equal(
      (await h.request(`/documents/${saved.id}/original`, alice.cookie)).status,
      200,
    );
    h.advance(60_000);
    assert.equal(
      (await h.request(`/documents/${saved.id}/original`, alice.cookie)).status,
      429,
    );
    assert.equal(h.reads(), 2);
    assert.equal((await bob.upload()).status, 201);
    assert.equal(
      (await alice.upload()).status,
      429,
      "the shared monthly budget applies across accounts",
    );
    h.advance(32 * 24 * 60 * 60 * 1000);
    alice = await h.account("alice@example.test");
    assert.equal(
      (await alice.upload()).status,
      201,
      "operation counters reset, lifetime account usage does not",
    );
    assert.equal((await alice.usage()).uploads, 2);
  } finally {
    h.store.close();
  }
});

test("a lost response after a successful commit is recovered without rewriting the original", async () => {
  const h = await setup();
  const commit = h.store.commitUpload.bind(h.store);
  h.store.commitUpload = async (doc) => {
    await commit(doc);
    throw new Error("commit succeeded but response was lost");
  };
  try {
    const alice = await h.account("alice@example.test");
    const key = crypto.randomUUID();
    assert.equal((await alice.upload(key)).status, 503);
    assert.equal((await alice.usage()).uploads, 1);
    assert.equal((await alice.usage()).reservedBytes, 0);
    assert.equal((await alice.upload(key)).status, 200);
    assert.equal(h.writes(), 1);
  } finally {
    h.store.close();
  }
});

test("failed cleanup retains capacity and unavailable guard lookups fail closed", async () => {
  const h = await setup();
  try {
    const alice = await h.account("alice@example.test");
    h.store.commitUpload = async () => {
      throw new HttpError(409, "rejected");
    };
    h.blobs.delete = async () => {
      throw new Error("R2 unavailable");
    };
    assert.equal((await alice.upload()).status, 503);
    assert.equal((await alice.usage()).reservedBytes, h.pdf.length);
    h.store.admitStorageOperation = async () => {
      throw new Error("quota database unavailable");
    };
    assert.equal((await alice.upload()).status, 503);
    assert.equal(h.writes(), 1);
  } finally {
    h.store.close();
  }
});
