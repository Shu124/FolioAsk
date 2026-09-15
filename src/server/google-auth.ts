import type { IdentityProvider, Account } from "./contracts.ts";
import { bodyJson, HttpError, json, requiredText } from "./http.ts";

const COOKIE = "folio_oauth";
const TTL = 600;
function oauthCookie(value: string, secure: boolean, age = TTL) {
  return `${COOKIE}=${value}; Path=/api/auth/google; HttpOnly; SameSite=Strict; Max-Age=${age}${secure ? "; Secure" : ""}`;
}

export async function googleAuth(
  request: Request,
  auth: IdentityProvider,
  now: number,
  signIn: (account: Account) => Promise<Response>,
) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/auth/google") || request.method !== "POST")
    return;
  const secure = url.protocol === "https:";
  if (!auth.googleUrl || !auth.exchangeGoogle)
    throw new HttpError(
      503,
      "Google sign-in is not configured. Use email sign-in or contact the operator.",
    );
  if (url.pathname === "/api/auth/google") {
    const verifier = crypto.randomUUID() + crypto.randomUUID();
    const state = crypto.randomUUID();
    const digest = new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
    );
    const challenge = btoa(String.fromCharCode(...digest))
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replaceAll("=", "");
    const redirect = new URL("/app", url.origin);
    redirect.searchParams.set("oauth", "google");
    redirect.searchParams.set("state", state);
    let destination: string;
    try {
      destination = await auth.googleUrl(redirect.href, challenge);
    } catch {
      throw new HttpError(
        503,
        "Google sign-in is not configured or temporarily unavailable. Use email sign-in or contact the operator.",
      );
    }
    return json({ url: destination }, 200, {
      "Set-Cookie": oauthCookie(
        encodeURIComponent(
          JSON.stringify({ verifier, state, expiresAt: now + TTL * 1000 }),
        ),
        secure,
      ),
    });
  }
  if (url.pathname !== "/api/auth/google/complete") return;
  let response: Response;
  try {
    const data = await bodyJson(request);
    const encoded = request.headers
      .get("cookie")
      ?.split(";")
      .map((value) => value.trim())
      .find((value) => value.startsWith(`${COOKIE}=`))
      ?.slice(COOKIE.length + 1);
    const saved = JSON.parse(decodeURIComponent(encoded ?? ""));
    if (
      !saved ||
      typeof saved.verifier !== "string" ||
      saved.verifier.length !== 72 ||
      !Number.isFinite(saved.expiresAt) ||
      saved.expiresAt <= now ||
      data.state !== saved.state ||
      typeof saved.state !== "string"
    )
      throw new Error("Invalid state");
    const account = await auth.exchangeGoogle(
      requiredText(data.code, "Code", 2048),
      saved.verifier,
    );
    response = await signIn(account);
  } catch {
    response = json(
      {
        error:
          "Google sign-in could not be completed. Please start again in this browser.",
      },
      400,
    );
  }
  response.headers.append("Set-Cookie", oauthCookie("", secure, 0));
  return response;
}
