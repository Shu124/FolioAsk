import { test } from "node:test";
import assert from "node:assert/strict";
import { createApi } from "../../src/server/api.ts";
import { SqliteStore } from "../../src/server/sqlite-store.ts";
import { supabaseAdapters } from "../../src/server/supabase.ts";
import { createHash } from "node:crypto";

test("Google sign-in requires browser state and exchanges a one-use code for a private session", async () => {
  const store = new SqliteStore(":memory:");
  let used = false;
  const api = createApi({
    store,
    auth: {
      async signIn() {
        throw new Error("not used");
      },
      async signUp() {},
      async googleUrl(redirect: string, challenge: string) {
        const url = new URL("https://identity.example/authorize");
        url.searchParams.set("redirect_to", redirect);
        url.searchParams.set("code_challenge", challenge);
        return url.href;
      },
      async exchangeGoogle(code: string, verifier: string) {
        if (used || code !== "provider-code" || verifier.length < 43)
          throw new Error("invalid code");
        used = true;
        return { id: "google-user", email: "google@example.test" };
      },
    },
  });
  const request = (
    path: string,
    body?: unknown,
    cookie = "",
    method = "POST",
    origin = "https://folio.test",
  ) =>
    api(
      new Request(`https://folio.test/api${path}`, {
        method,
        headers: {
          Origin: origin,
          Cookie: cookie,
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
  try {
    assert.equal(
      (
        await request(
          "/auth/google",
          undefined,
          "",
          "POST",
          "https://evil.test",
        )
      ).status,
      403,
    );
    const start = await request("/auth/google");
    assert.equal(start.status, 200);
    const cookie = start.headers.get("set-cookie")!.split(";")[0];
    assert.match(start.headers.get("set-cookie")!, /HttpOnly/);
    const url = new URL((await start.json()).url);
    assert.equal(url.searchParams.get("code_challenge")?.length, 43);
    const state = new URL(
      url.searchParams.get("redirect_to")!,
    ).searchParams.get("state");
    assert.equal(
      (await request("/auth/google/complete", { code: "provider-code", state }))
        .status,
      400,
    );
    assert.equal(
      (
        await request(
          "/auth/google/complete",
          { code: "provider-code", state: "wrong" },
          cookie,
        )
      ).status,
      400,
    );
    const result = await request(
      "/auth/google/complete",
      { code: "provider-code", state },
      cookie,
    );
    assert.equal(result.status, 200);
    const sessionCookie = result.headers
      .getSetCookie()
      .find((value) => value.startsWith("folio_session="))!
      .split(";")[0];
    const session = await request("/session", undefined, sessionCookie, "GET");
    assert.equal((await session.json()).email, "google@example.test");
    assert.equal(
      (
        await request(
          "/auth/google/complete",
          { code: "provider-code", state },
          cookie,
        )
      ).status,
      400,
    );
  } finally {
    store.close();
  }
});

test("public Google API uses Supabase PKCE and verified identity, rejecting provider failures", async (t) => {
  const store = new SqliteStore(":memory:");
  let challenge = "";
  let denyIdentity = false;
  t.mock.method(
    globalThis,
    "fetch",
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      assert.equal(url.origin, "https://identity.test");
      if (url.pathname === "/auth/v1/settings")
        return Response.json({ external: { google: true } });
      if (url.pathname === "/auth/v1/token") {
        assert.equal(url.searchParams.get("grant_type"), "pkce");
        const body = JSON.parse(String(init?.body));
        assert.equal(body.auth_code, "provider-code");
        assert.equal(
          createHash("sha256").update(body.code_verifier).digest("base64url"),
          challenge,
        );
        return Response.json({
          access_token: "verified-access-token",
          user: { id: "must-not-trust", email: "wrong@example.test" },
        });
      }
      assert.equal(url.pathname, "/auth/v1/user");
      assert.equal(
        new Headers(init?.headers).get("Authorization"),
        "Bearer verified-access-token",
      );
      return denyIdentity
        ? Response.json({}, { status: 401 })
        : Response.json({
            id: "verified-user",
            email: "verified@example.test",
          });
    },
  );
  const { auth } = supabaseAdapters({
    SUPABASE_URL: "https://identity.test",
    SUPABASE_SERVICE_ROLE_KEY: "server-only-test-secret",
  });
  const api = createApi({ store, auth });
  const request = (path: string, body?: unknown, cookie = "") =>
    api(
      new Request(`https://folio.test/api${path}`, {
        method: "POST",
        headers: {
          Origin: "https://folio.test",
          Cookie: cookie,
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
  try {
    for (const denied of [false, true]) {
      denyIdentity = denied;
      const start = await request("/auth/google");
      const body = await start.json();
      assert.ok(!JSON.stringify(body).includes("server-only-test-secret"));
      const url = new URL(body.url);
      assert.equal(url.pathname, "/auth/v1/authorize");
      assert.equal(url.searchParams.get("provider"), "google");
      assert.equal(url.searchParams.get("code_challenge_method"), "s256");
      challenge = url.searchParams.get("code_challenge")!;
      const state = new URL(
        url.searchParams.get("redirect_to")!,
      ).searchParams.get("state");
      const result = await request(
        "/auth/google/complete",
        { code: "provider-code", state },
        start.headers.get("set-cookie")!.split(";")[0],
      );
      assert.equal(result.status, denied ? 400 : 200);
      if (!denied)
        assert.equal((await result.json()).email, "verified@example.test");
      else
        assert.ok(
          !result.headers.get("set-cookie")?.includes("folio_session="),
        );
    }
  } finally {
    store.close();
  }
});
