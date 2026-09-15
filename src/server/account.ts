import type { Account, IdentityProvider, Store } from "./contracts.ts";
import { bodyJson, HttpError, json, requiredText } from "./http.ts";

export async function accountRoute(
  request: Request,
  account: Account,
  auth: IdentityProvider,
  store: Store,
): Promise<Response | undefined> {
  const path = new URL(request.url).pathname;
  if (path === "/api/account" && request.method === "GET") {
    if (!auth.account)
      throw new HttpError(503, "Account settings are unavailable.");
    return json(await auth.account(account.id));
  }
  if (path === "/api/account" && request.method === "PATCH") {
    if (!auth.updateName || !auth.account)
      throw new HttpError(503, "Account settings are unavailable.");
    const data = await bodyJson(request);
    await auth.updateName(
      account.id,
      requiredText(data.name, "Display name", 100),
    );
    return json(await auth.account(account.id));
  }
  if (path !== "/api/account/password" || request.method !== "POST") return;
  if (!auth.changePassword || !auth.account)
    throw new HttpError(503, "Password changes are unavailable.");
  const profile = await auth.account(account.id);
  if (!profile.providers?.includes("email"))
    throw new HttpError(
      400,
      "Manage your password with your sign-in provider.",
    );
  const data = await bodyJson(request);
  if (
    typeof data.currentPassword !== "string" ||
    !data.currentPassword ||
    data.currentPassword.length > 256 ||
    typeof data.password !== "string" ||
    data.password.length < 12 ||
    data.password.length > 256
  )
    throw new HttpError(
      400,
      "Enter your current password and a new password of 12 to 256 characters.",
    );
  try {
    await auth.changePassword(profile, data.currentPassword, data.password);
  } catch {
    throw new HttpError(
      400,
      "Password could not be changed. Check your current password and try again.",
    );
  }
  await store.deleteAccountSessions(account.id);
  return json({
    message: "Password changed. Sign in again with your new password.",
  });
}
