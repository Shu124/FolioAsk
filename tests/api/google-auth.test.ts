import { test } from "node:test";
import assert from "node:assert/strict";
import { createApi } from "../../src/server/api.ts";
import { SqliteStore } from "../../src/server/sqlite-store.ts";

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
