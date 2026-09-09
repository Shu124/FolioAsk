import { test } from "node:test";
import assert from "node:assert/strict";
import { createApi } from "../../src/server/api.ts";
import { SqliteStore } from "../../src/server/sqlite-store.ts";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("accounts recover sessions and persist only their own workspaces", async () => {
  const folder = await mkdtemp(join(tmpdir(), "folioask-test-"));
  const filename = join(folder, "state.sqlite");
  const auth = {
    signIn: async (email: string, password: string) => {
      if (password !== "test-password") throw new Error("invalid credentials");
      return { id: email, email };
    },
    signUp: async () => {},
  };
  let store = new SqliteStore(filename);
  let api = createApi({ store, auth });
  const request = (path: string, method = "GET", body?: unknown, cookie = "") =>
    api(
      new Request(`http://localhost/api${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost",
          Cookie: cookie,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
  try {
    assert.equal((await request("/workspaces")).status, 401);
    assert.equal(
      (
        await request("/session", "POST", {
          email: "alice@example.test",
          password: "wrong",
        })
      ).status,
      401,
    );
    const login = await request("/session", "POST", {
      email: "alice@example.test",
      password: "test-password",
    });
    assert.equal(login.status, 200);
    assert.match(login.headers.get("set-cookie")!, /HttpOnly/);
    const alice = login.headers.get("set-cookie")!.split(";")[0];
    const created = await request(
      "/workspaces",
      "POST",
      { name: "Elm Street", ownerId: "bob@example.test" },
      alice,
    );
    assert.equal(created.status, 201);
    const workspace = await created.json();
    store.close();
    store = new SqliteStore(filename);
    api = createApi({ store, auth });
    assert.equal(
      (await (await request("/session", "GET", undefined, alice)).json()).email,
      "alice@example.test",
    );
    assert.equal(
      (
        await (
          await request(`/workspaces/${workspace.id}`, "GET", undefined, alice)
        ).json()
      ).name,
      "Elm Street",
    );
    const bobLogin = await request("/session", "POST", {
      email: "bob@example.test",
      password: "test-password",
    });
    const bob = bobLogin.headers.get("set-cookie")!.split(";")[0];
    assert.deepEqual(
      await (await request("/workspaces", "GET", undefined, bob)).json(),
      [],
    );
    assert.equal(
      (await request(`/workspaces/${workspace.id}`, "GET", undefined, bob))
        .status,
      404,
    );
    assert.equal(
      (
        await request(
          `/workspaces/${workspace.id}`,
          "PATCH",
          { name: "stolen" },
          bob,
        )
      ).status,
      404,
    );
    assert.equal(
      (await request("/session", "DELETE", undefined, alice)).status,
      204,
    );
    assert.equal(
      (await request("/workspaces", "GET", undefined, alice)).status,
      401,
    );
  } finally {
    store.close();
    await rm(folder, { recursive: true, force: true });
  }
});
