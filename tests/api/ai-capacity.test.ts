import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  AI_LIMITS,
  estimatedInputTokens,
  sharedAiQuota,
} from "../../src/server/ai-capacity.ts";
import { unpaidGemini } from "../../src/server/gemini.ts";
import { createApi } from "../../src/server/api.ts";
import { SqliteStore } from "../../src/server/sqlite-store.ts";

test("AI PostgreSQL ledger: atomic caps, warnings, private RPCs, disabled default and Pacific windows", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "set timezone='UTC'; create role anon; create role authenticated; create role service_role bypassrls;",
    );
    await db.exec(
      await readFile(
        new URL(
          "../../supabase/migrations/007_ai_capacity.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    async function snapshot() {
      return (
        await db.query<{
          result: {
            state: string;
            models: {
              model: string;
              rpm: number;
              tpm: number;
              rpd: number;
              requests: number;
              tokens: number;
              daily: number;
            }[];
          };
        }>("select public.folio_ai_capacity() as result")
      ).rows[0].result;
    }
    async function reserve(model: string, requests = 1, tokens = 1) {
      return (
        await db.query<{ result: { allowed: boolean } }>(
          "select public.folio_reserve_ai($1,$2,$3) as result",
          [model, requests, tokens],
        )
      ).rows[0].result.allowed;
    }
    assert.equal((await snapshot()).state, "paused");
    assert.equal(await reserve("gemini-3.5-flash-lite"), false);
    await db.exec("update public.folio_ai_policy set enabled=true");
    for (const entry of (await snapshot()).models) {
      const caps = Object.entries(AI_LIMITS).find(
        ([model]) => model === entry.model,
      )![1];
      assert.deepEqual(
        { rpm: entry.rpm, tpm: entry.tpm, rpd: entry.rpd },
        caps,
      );
    }
    for (const [model, caps] of Object.entries(AI_LIMITS)) {
      await db.exec("delete from public.folio_ai_reservations");
      const warningRequests = model === "gemini-3.5-flash-lite" ? 12 : 80;
      assert.equal(await reserve(model, warningRequests - 1), true);
      assert.equal((await snapshot()).state, "available");
      assert.equal(await reserve(model), true);
      assert.equal(
        (await snapshot()).state,
        "warning",
        "warn at 80% of Google's request limit",
      );
      await db.exec("delete from public.folio_ai_reservations");
      const results = await Promise.all(
        Array.from({ length: caps.rpm + 3 }, () => reserve(model)),
      );
      assert.equal(
        results.filter(Boolean).length,
        caps.rpm,
        "queued local callers cannot over-admit (PGlite uses one connection)",
      );
      assert.equal((await snapshot()).state, "paused");
      await db.exec("delete from public.folio_ai_reservations");
      assert.equal(await reserve(model, 1, caps.tpm - 1), true);
      assert.equal((await snapshot()).state, "warning");
      assert.equal(
        await reserve(model, 1, 2),
        false,
        "reject before crossing token cap",
      );
      assert.equal(await reserve(model, 1, 1), true, "exact cap allowed");
      assert.equal(await reserve(model), false);
      await db.exec("delete from public.folio_ai_reservations");
      await db.query(
        "insert into public.folio_ai_reservations(model,admitted_at,requests,tokens) values($1,clock_timestamp()-interval '121 seconds',$2,1)",
        [model, caps.rpd - 1],
      );
      assert.equal((await snapshot()).state, "warning");
      assert.equal(
        await reserve(model, 2),
        false,
        "daily cap independent of minute caps",
      );
      assert.equal(await reserve(model), true);
      assert.equal(await reserve(model), false);
    }
    await assert.rejects(reserve("unknown"));
    await assert.rejects(reserve("gemini-embedding-001", 0));
    await assert.rejects(reserve("gemini-embedding-001", 1, -1));
    await db.exec("delete from public.folio_ai_reservations");
    await db.query(
      "insert into public.folio_ai_reservations(model,admitted_at,requests,tokens) values('gemini-3.5-flash-lite',clock_timestamp()-interval '119 seconds',13,1)",
    );
    assert.equal(await reserve("gemini-3.5-flash-lite"), false);
    await db.exec(
      "update public.folio_ai_reservations set admitted_at=clock_timestamp()-interval '121 seconds'",
    );
    assert.equal(
      await reserve("gemini-3.5-flash-lite"),
      true,
      "rolling window recovers",
    );
    await db.exec("delete from public.folio_ai_reservations");
    await db.exec(
      "insert into public.folio_ai_reservations(model,admitted_at,requests,tokens) values('gemini-3.5-flash-lite',(date_trunc('day',clock_timestamp() at time zone 'America/Los_Angeles') at time zone 'America/Los_Angeles')-interval '121 seconds',450,1)",
    );
    assert.equal(
      await reserve("gemini-3.5-flash-lite"),
      true,
      "previous Pacific day expires including overlap",
    );
    const offsets = await db.query<{ stamp: string }>(
      "select to_char(date_trunc('day',v at time zone 'America/Los_Angeles') at time zone 'America/Los_Angeles', 'YYYY-MM-DD HH24:MI') as stamp from (values ('2026-01-15T20:00Z'::timestamptz),('2026-07-15T20:00Z'::timestamptz)) t(v)",
    );
    assert.deepEqual(
      offsets.rows.map((row) => row.stamp),
      ["2026-01-15 08:00", "2026-07-15 07:00"],
    );
    await db.exec("set role service_role");
    await snapshot();
    await reserve("gemini-embedding-001");
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`reset role; set role ${role}`);
      await assert.rejects(snapshot(), /permission denied/);
      await assert.rejects(
        reserve("gemini-embedding-001"),
        /permission denied/,
      );
      await assert.rejects(
        db.query("select * from public.folio_ai_reservations"),
        /permission denied/,
      );
      await assert.rejects(
        db.query("update public.folio_ai_policy set enabled=true"),
        /permission denied/,
      );
    }
    await db.exec(
      "reset role; delete from public.folio_ai_reservations; delete from public.folio_ai_policy where model='gemini-embedding-001'",
    );
    await assert.rejects(snapshot(), /incomplete/);
    await assert.rejects(reserve("gemini-3.5-flash-lite"), /incomplete/);
  } finally {
    await db.close();
  }
});

test("Gemini reserves every outbound attempt, counts batch items, pins tested model and never falls back", async (t) => {
  const admissions: { name: string; body: unknown }[] = [];
  let allowed: unknown = { allowed: true };
  const quota = sharedAiQuota(async (name, body) => {
    admissions.push({ name, body });
    return allowed;
  });
  const urls: string[] = [];
  const payloads: unknown[] = [];
  let fail = false;
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.equal(
      admissions.length,
      urls.length + 1,
      "reservation BEFORE fetch",
    );
    urls.push(url);
    payloads.push(JSON.parse(String(init.body)));
    if (fail) return Response.json({}, { status: 429 });
    return Response.json(
      url.includes("batchEmbedContents")
        ? { embeddings: [{ values: [1, 0] }, { values: [1, 0] }] }
        : {
            candidates: [
              {
                content: {
                  parts: [{ text: '{"status":"not_found","claims":[]}' }],
                },
              },
            ],
          },
    );
  });
  const provider = unpaidGemini("test-not-a-secret", quota);
  await provider.embed(["hello", "こんにちは"], "document");
  await provider.answer("question", []);
  assert.match(urls[0], /gemini-embedding-001:batchEmbedContents$/);
  assert.match(urls[1], /gemini-3.5-flash-lite:generateContent$/);
  assert.deepEqual(admissions[0], {
    name: "folio_reserve_ai",
    body: {
      p_model: "gemini-embedding-001",
      p_requests: 2,
      p_tokens: estimatedInputTokens(payloads[0], 2),
    },
  });
  fail = true;
  await assert.rejects(provider.answer("again", []), /capacity is exhausted/);
  assert.equal(
    admissions.length,
    3,
    "failed provider calls stay reserved; no refund RPC",
  );
  allowed = { allowed: false };
  await assert.rejects(provider.answer("retry", []), /Shared free AI capacity/);
  assert.equal(urls.length, 3, "denial does not call Google");
});

test("missing/malformed ledger fails closed, huge indexing rejected before any call", async (t) => {
  let providerCalls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    providerCalls++;
    throw new Error("must not call");
  });
  for (const result of [null, {}, { allowed: "true" }, { allowed: 1 }]) {
    const provider = unpaidGemini(
      "test",
      sharedAiQuota(async () => result),
    );
    await assert.rejects(
      provider.embed(["text"], "query"),
      /tracking is unavailable/,
    );
  }
  const broken = sharedAiQuota(async () => {
    throw new Error("missing RPC");
  });
  assert.deepEqual(await broken.snapshot(), { state: "unavailable" });
  await assert.rejects(
    unpaidGemini("test", broken).answer("text", []),
    /tracking is unavailable/,
  );
  let reserves = 0;
  const provider = unpaidGemini(
    "test",
    sharedAiQuota(async () => {
      reserves++;
      return { allowed: true };
    }),
  );
  await assert.rejects(
    provider.embed(["x".repeat(30_000)], "document"),
    /smaller approved document/,
  );
  await assert.rejects(
    provider.embed(Array(91).fill("x"), "document"),
    /smaller approved document/,
  );
  assert.equal(reserves, 0);
  assert.equal(providerCalls, 0);
});

test("shared AI status is authenticated and reveals no ledger or user details", async () => {
  const store = new SqliteStore(":memory:");
  try {
    const quota = sharedAiQuota(async () => ({
      state: "warning",
      models: [{ secretDetail: "omit" }],
    }));
    const api = createApi({
      store,
      auth: {
        signIn: async (email) => ({ id: email, email }),
        signUp: async () => {},
      },
      aiQuota: quota,
      answers: { store, provider: unpaidGemini("test", quota) },
    });
    assert.equal(
      (await api(new Request("http://localhost/api/ai-capacity"))).status,
      401,
    );
    const signIn = await api(
      new Request("http://localhost/api/session", {
        method: "POST",
        headers: {
          Origin: "http://localhost",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: "test@example.test",
          password: "test-password",
        }),
      }),
    );
    const cookie = signIn.headers.get("set-cookie")!.split(";")[0];
    const response = await api(
      new Request("http://localhost/api/ai-capacity", {
        headers: { Cookie: cookie },
      }),
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.deepEqual(await response.json(), { state: "warning" });
  } finally {
    store.close();
  }
});
