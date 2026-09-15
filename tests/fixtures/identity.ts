import type { IdentityProvider } from "../../src/server/contracts.ts";
import { createHash } from "node:crypto";

/** Loopback-only external identity simulation; never imported by production. */
export function controlledIdentity(): IdentityProvider {
  const profiles = new Map<
    string,
    { name: string; password: string; providers: string[] }
  >();
  const profile = (id: string) => {
    if (!profiles.has(id))
      profiles.set(id, {
        name: "",
        password: "local-test-password",
        providers: ["email"],
      });
    return profiles.get(id)!;
  };
  const codes = new Map<
    string,
    { challenge: string; expires: number; email: string }
  >();
  return {
    async account(id) {
      const value = profile(id);
      return { id, email: id, name: value.name, providers: value.providers };
    },
    async updateName(id, name) {
      profile(id).name = name;
    },
    async changePassword(account, currentPassword, password) {
      const value = profile(account.id);
      if (value.password !== currentPassword) throw new Error("Wrong password");
      value.password = password;
    },
    async signIn(email, password) {
      if (
        !email.endsWith("@example.test") ||
        password !== profile(email).password
      )
        throw new Error("Invalid fixture credentials");
      return { id: email, email };
    },
    async signUp() {
      throw new Error("Fixture accounts only");
    },
    async googleUrl(redirect, challenge) {
      for (const [code, value] of codes)
        if (value.expires < Date.now()) codes.delete(code);
      const code = crypto.randomUUID();
      codes.set(code, {
        challenge,
        expires: Date.now() + 60_000,
        email: `google-${crypto.randomUUID()}@example.test`,
      });
      const url = new URL(redirect);
      url.searchParams.set("code", code);
      return url.href;
    },
    async exchangeGoogle(code, verifier) {
      const value = codes.get(code);
      codes.delete(code);
      if (
        !value ||
        value.expires < Date.now() ||
        createHash("sha256").update(verifier).digest("base64url") !==
          value.challenge
      )
        throw new Error("Invalid code");
      profile(value.email).providers = ["google"];
      return { id: value.email, email: value.email };
    },
  };
}
