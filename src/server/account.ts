import type { Account, IdentityProvider, Store } from "./contracts.ts";
import { bodyJson, HttpError, json, requiredText } from "./http.ts";

export async function accountRoute(
  request: Request,
  account: Account,
  auth: IdentityProvider,
  store: Store,
): Promise<Response | undefined> {
  const path = new URL(request.url).pathname;
  if (path === "/api/account/onboarding" && request.method === "PATCH") {
    if (!auth.updateOnboarding || !auth.account)
      throw new HttpError(503, "Profile setup is unavailable. Please retry.");
    const data = await bodyJson(request);
    const name = requiredText(data.name, "Display name", 100);
    const industry = requiredText(data.industry, "Industry", 40);
    if (
      !["Construction", "Finance", "Healthcare", "Other"].includes(industry) ||
      typeof data.complete !== "boolean" ||
      (data.complete && data.acknowledge !== true) ||
      (data.plan !== undefined && data.plan !== "free")
    )
      throw new HttpError(
        400,
        "Choose an industry and acknowledge the free pilot restrictions. Paid plans are not available.",
      );
    const existing = await auth.account(account.id);
    await auth.updateOnboarding(account.id, {
      name,
      industry,
      complete: existing.onboardingComplete === true || data.complete,
    });
    return json(await auth.account(account.id));
  }
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
    const verified = await auth.signIn(profile.email, data.currentPassword);
    if (verified.id !== account.id) throw new Error("Identity mismatch");
  } catch {
    throw new HttpError(
      400,
      "Password could not be changed. Check your current password and try again.",
    );
  }
  // Revoke first: a storage failure must never leave a changed password with old sessions.
  await store.deleteAccountSessions(account.id);
  try {
    await auth.changePassword(profile, data.currentPassword, data.password);
  } catch {
    throw new HttpError(
      401,
      "Password update could not be confirmed. Your FolioAsk sessions were signed out. Try signing in with your existing password; if that fails, try the new password or contact support.",
    );
  }
  return json({
    message: "Password changed. Sign in again with your new password.",
  });
}
