import type { Usage } from "./documents.ts";
import type { StorageSnapshot } from "./storage-limits.ts";

/** Current pilot only. Subscription activation requires new transactional ledgers.
 * These limits are also enforced by the existing Supabase commit procedures.
 * Do not change this object alone to enable a paid plan or reset allowances.
 */
export const PILOT_ENTITLEMENTS = {
  plan: "free",
  checkoutEnabled: false,
  allowancePeriod: "lifetime",
  uploads: 3,
  answers: 20,
  documentsPerQuestion: 1,
  fileBytes: 30_000_000,
  storageBytes: 30_000_000,
} as const;

export interface PlanUsage extends Usage, StorageSnapshot {
  plan: typeof PILOT_ENTITLEMENTS.plan;
  checkoutEnabled: typeof PILOT_ENTITLEMENTS.checkoutEnabled;
  uploadLimit: number;
  answerLimit: number;
  storageLimitBytes: number;
  fileLimitBytes: number;
  uploadsRemaining: number;
  answersRemaining: number;
  storageRemainingBytes: number;
}

/** Account entitlements do not depend on the AI provider's billing tier. */
export function planUsage(usage: Usage, storage: StorageSnapshot): PlanUsage {
  return {
    ...usage,
    ...storage,
    plan: PILOT_ENTITLEMENTS.plan,
    checkoutEnabled: PILOT_ENTITLEMENTS.checkoutEnabled,
    uploadLimit: PILOT_ENTITLEMENTS.uploads,
    answerLimit: PILOT_ENTITLEMENTS.answers,
    storageLimitBytes: PILOT_ENTITLEMENTS.storageBytes,
    fileLimitBytes: PILOT_ENTITLEMENTS.fileBytes,
    uploadsRemaining: Math.max(
      0,
      PILOT_ENTITLEMENTS.uploads - usage.uploads - storage.reservedUploads,
    ),
    answersRemaining: Math.max(0, PILOT_ENTITLEMENTS.answers - usage.answers),
    storageRemainingBytes: Math.max(
      0,
      PILOT_ENTITLEMENTS.storageBytes - usage.storedBytes - storage.reservedBytes,
    ),
  };
}
