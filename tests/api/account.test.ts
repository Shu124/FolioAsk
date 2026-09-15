import { test } from "node:test";
import assert from "node:assert/strict";
import { createApi } from "../../src/server/api.ts";
import { SqliteStore } from "../../src/server/sqlite-store.ts";
import { controlledIdentity } from "../fixtures/identity.ts";
import { supabaseAdapters } from "../../src/server/supabase.ts";

test("account settings persist names and password changes require reauthentication and revoke sessions", async () => {
  const store = new SqliteStore(":memory:");
  const api = createApi({ store, auth: controlledIdentity() });
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
      password: "local-test-password",
    });
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    const another = (
      await call("/session", "POST", {
        email: "alice@example.test",
        password: "local-test-password",
      })
    ).headers
      .get("set-cookie")!
      .split(";")[0];
    const bob = (
      await call("/session", "POST", {
        email: "bob@example.test",
        password: "local-test-password",
      })
    ).headers
      .get("set-cookie")!
      .split(";")[0];
    assert.equal((await call("/account")).status, 401);
    assert.equal(
      (
        await call(
          "/account",
          "PATCH",
          { name: "Alice", id: "bob@example.test" },
          cookie,
        )
      ).status,
      200,
    );
    assert.equal(
      (await (await call("/account", "GET", undefined, cookie)).json()).name,
      "Alice",
    );
    assert.equal(
      (
        await call(
          "/account/password",
          "POST",
          { currentPassword: "wrong", password: "changed-test-password" },
          cookie,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await call(
          "/account/password",
          "POST",
          { currentPassword: "local-test-password", password: "short" },
          cookie,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await call(
          "/account/password",
          "POST",
          {
            currentPassword: "local-test-password",
            password: "changed-test-password",
          },
          cookie,
        )
      ).status,
      200,
    );
    assert.equal(
      (await call("/session", "GET", undefined, cookie)).status,
      401,
    );
    assert.equal(
      (await call("/session", "GET", undefined, another)).status,
      401,
    );
    assert.equal((await call("/session", "GET", undefined, bob)).status, 200);
    assert.equal(
      (await (await call("/account", "GET", undefined, bob)).json()).name,
      "",
    );
    assert.equal(
      (
        await call("/session", "POST", {
          email: "alice@example.test",
          password: "local-test-password",
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await call("/session", "POST", {
          email: "alice@example.test",
          password: "changed-test-password",
        })
      ).status,
      200,
    );
  } finally {
    store.close();
  }
});

test("account API uses authenticated Supabase user for password updates and whitelists profile edits", async (t) => {
  const store = new SqliteStore(":memory:");
  let name = "Original";
  let updatedPassword = "local-test-password";
  t.mock.method(
    globalThis,
    "fetch",
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      assert.equal(url.origin, "https://identity.test");
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      if (url.pathname === "/auth/v1/token") {
        if (body.password !== updatedPassword)
          return Response.json({}, { status: 400 });
        return Response.json({
          access_token: "user-scoped-test-token",
          user: { id: "alice-id", email: "alice@example.test" },
        });
      }
      if (url.pathname === "/auth/v1/user") {
        assert.equal(init?.method, "PUT");
        assert.equal(
          new Headers(init?.headers).get("Authorization"),
          "Bearer user-scoped-test-token",
        );
        assert.equal(body.current_password, updatedPassword);
        updatedPassword = body.password;
        return Response.json({ id: "alice-id" });
      }
      assert.equal(url.pathname, "/auth/v1/admin/users/alice-id");
      if (init?.method === "PUT") {
        assert.deepEqual(Object.keys(body), ["user_metadata"]);
        assert.deepEqual(Object.keys(body.user_metadata), ["display_name"]);
        name = body.user_metadata.display_name;
      }
      return Response.json({
        id: "alice-id",
        email: "alice@example.test",
        user_metadata: { display_name: name },
        app_metadata: { providers: ["email"] },
      });
    },
  );
  const { auth } = supabaseAdapters({
    SUPABASE_URL: "https://identity.test",
    SUPABASE_SERVICE_ROLE_KEY: "server-only-test-key",
  });
  const api = createApi({ store, auth });
  const call = (path: string, method: string, body?: unknown, cookie = "") =>
    api(
      new Request(`https://folio.test/api${path}`, {
        method,
        headers: {
          Origin: "https://folio.test",
          Cookie: cookie,
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
  try {
    const login = await call("/session", "POST", {
      email: "alice@example.test",
      password: "local-test-password",
    });
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    const profile = await call(
      "/account",
      "PATCH",
      {
        name: "New name",
        id: "victim-id",
        email: "attacker@example.test",
        app_metadata: { role: "admin" },
      },
      cookie,
    );
    assert.equal((await profile.json()).name, "New name");
    assert.equal(
      (
        await call(
          "/account/password",
          "POST",
          { currentPassword: "wrong", password: "new-test-password" },
          cookie,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await call(
          "/account/password",
          "POST",
          {
            currentPassword: "local-test-password",
            password: "new-test-password",
          },
          cookie,
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await call("/session", "POST", {
          email: "alice@example.test",
          password: "new-test-password",
        })
      ).status,
      200,
    );
  } finally {
    store.close();
  }
});
