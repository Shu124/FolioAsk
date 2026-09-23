import { test } from "node:test";
import assert from "node:assert/strict";
import { createApi } from "../../src/server/api.ts";
import { SqliteStore } from "../../src/server/sqlite-store.ts";
import { controlledIdentity } from "../fixtures/identity.ts";

test("onboarding saves account preferences, resumes drafts and rejects unapproved industries or plans", async () => {
  const store = new SqliteStore(":memory:");
  const handle = createApi({ store, auth: controlledIdentity() });
  let cookie = "";
  const call = (path: string, method = "GET", body?: unknown) =>
    handle(
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
    assert.equal((await call("/account/onboarding", "PATCH", {})).status, 401);
    cookie = (
      await call("/session", "POST", {
        email: "onboard@example.test",
        password: "local-test-password",
      })
    ).headers
      .get("set-cookie")!
      .split(";")[0];
    assert.equal(
      (
        await call("/account/onboarding", "PATCH", {
          name: "Sam",
          industry: "Construction",
          complete: false,
        })
      ).status,
      200,
    );
    let profile = await (await call("/account")).json();
    assert.equal(profile.name, "Sam");
    assert.equal(profile.industry, "Construction");
    assert.equal(profile.onboardingComplete, false);
    assert.equal(
      (
        await call("/account/onboarding", "PATCH", {
          name: "Sam",
          industry: "Invalid",
          complete: true,
          acknowledge: true,
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await call("/account/onboarding", "PATCH", {
          name: "Sam",
          industry: "Finance",
          complete: true,
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await call("/account/onboarding", "PATCH", {
          name: "Sam",
          industry: "Finance",
          complete: true,
          acknowledge: true,
          plan: "paid",
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await call("/account/onboarding", "PATCH", {
          name: "Sam",
          industry: "Finance",
          complete: true,
          acknowledge: true,
        })
      ).status,
      200,
    );
    profile = await (await call("/account")).json();
    assert.equal(profile.onboardingComplete, true);
    assert.equal(profile.industry, "Finance");
    cookie = (
      await call("/session", "POST", {
        email: "other@example.test",
        password: "local-test-password",
      })
    ).headers
      .get("set-cookie")!
      .split(";")[0];
    assert.equal(
      (await (await call("/account")).json()).onboardingComplete,
      false,
    );
  } finally {
    store.close();
  }
});
