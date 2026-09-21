import { test } from "node:test";
import assert from "node:assert/strict";
import { createApi } from "../../src/server/api.ts";
import { SqliteStore } from "../../src/server/sqlite-store.ts";

test("project activity is owned and active time is bounded, durable and deduplicated across tabs", async () => {
  const store = new SqliteStore(":memory:");
  const now = Date.UTC(2026, 8, 21, 12);
  const api = createApi({
    store,
    auth: {
      signIn: async (email) => ({ id: email, email }),
      signUp: async () => {},
    },
    now: () => now,
    activity: { store },
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
  const login = async (email: string) =>
    (
      await call("/session", "POST", { email, password: "test-password" })
    ).headers
      .get("set-cookie")!
      .split(";")[0];
  try {
    const cookie = await login("alice@example.test");
    const project = await (
      await call("/workspaces", "POST", { name: "Metrics" }, cookie)
    ).json();
    const other = await (
      await call("/workspaces", "POST", { name: "Other tab" }, cookie)
    ).json();
    const path = `/workspaces/${project.id}/activity`;
    const read = async () =>
      (await call(path, "GET", undefined, cookie)).json();
    const initial = await read();
    assert.equal(initial.activeTime.milliseconds, 0);
    assert.equal(initial.activeTime.startedAt, undefined);
    assert.equal(initial.counts.documents, 0);
    assert.equal(initial.days.length, 7);
    assert.deepEqual(initial.recent, []);
    const body = { bucket: now - 15000, milliseconds: 12000 };
    const responses = await Promise.all(
      Array.from({ length: 3 }, () => call(path, "POST", body, cookie)),
    );
    assert.ok(responses.every((response) => response.status === 200));
    assert.equal((await read()).activeTime.milliseconds, 12000);
    await call(path, "POST", { ...body, milliseconds: 14000 }, cookie);
    assert.equal((await read()).activeTime.milliseconds, 14000);
    await call(`/workspaces/${other.id}/activity`, "POST", body, cookie);
    assert.equal(
      (
        await (
          await call(
            `/workspaces/${other.id}/activity`,
            "GET",
            undefined,
            cookie,
          )
        ).json()
      ).activeTime.milliseconds,
      0,
    );
    for (const invalid of [
      { ...body, milliseconds: 15001 },
      { ...body, milliseconds: -1 },
      { ...body, bucket: now },
      { ...body, bucket: now - 120000 },
    ])
      assert.equal((await call(path, "POST", invalid, cookie)).status, 400);
    const bob = await login("bob@example.test");
    assert.equal((await call(path, "GET", undefined, bob)).status, 404);
    assert.equal((await call(path, "POST", body, bob)).status, 404);
    const cookie2 = await login("alice@example.test");
    assert.equal(
      (await (await call(path, "GET", undefined, cookie2)).json()).activeTime
        .milliseconds,
      14000,
    );
  } finally {
    store.close();
  }
});
