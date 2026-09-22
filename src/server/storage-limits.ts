import type { DocumentRecord, Usage } from "./documents.ts";

export const FREE_LIMITS = {
  uploads: 3,
  answers: 20,
  fileBytes: 10_000_000,
  storageBytes: 30_000_000,
} as const;

/** Also mirrored in migration 006. These are app safeguards, not billing caps. */
export const DEFAULT_STORAGE_POLICY = {
  totalBytes: 8_000_000_000,
  externalBytes: 0,
  uploadsEnabled: true,
  monthlyUploads: 100_000,
  monthlyReads: 1_000_000,
  uploadsPerMinute: 10,
  readsPerMinute: 120,
} as const;
export type StoragePolicy = {
  [K in keyof typeof DEFAULT_STORAGE_POLICY]: K extends "uploadsEnabled"
    ? boolean
    : number;
};
export type StorageOperation = "upload" | "read";
export interface StorageSnapshot {
  reservedBytes: number;
  reservedUploads: number;
  uploadsPaused: boolean;
}
export interface StorageGuardStore {
  storageSnapshot(ownerId: string): Promise<StorageSnapshot>;
  admitStorageOperation(
    ownerId: string,
    operation: StorageOperation,
    now: number,
  ): Promise<void>;
  /** undefined means this request owns a new reservation; a record means replay. */
  reserveUpload(document: DocumentRecord): Promise<DocumentRecord | undefined>;
  /** Only release after confirming that the original was removed. No expiry. */
  releaseUpload(id: string, ownerId: string): Promise<void>;
}
export interface PlanUsage extends Usage, StorageSnapshot {
  plan: "free";
  checkoutEnabled: false;
  uploadLimit: number;
  answerLimit: number;
  storageLimitBytes: number;
  fileLimitBytes: number;
  uploadsRemaining: number;
  answersRemaining: number;
  storageRemainingBytes: number;
}
export function planUsage(usage: Usage, storage: StorageSnapshot): PlanUsage {
  return {
    ...usage,
    ...storage,
    plan: "free",
    checkoutEnabled: false,
    uploadLimit: FREE_LIMITS.uploads,
    answerLimit: FREE_LIMITS.answers,
    storageLimitBytes: FREE_LIMITS.storageBytes,
    fileLimitBytes: FREE_LIMITS.fileBytes,
    uploadsRemaining: Math.max(
      0,
      FREE_LIMITS.uploads - usage.uploads - storage.reservedUploads,
    ),
    answersRemaining: Math.max(0, FREE_LIMITS.answers - usage.answers),
    storageRemainingBytes: Math.max(
      0,
      FREE_LIMITS.storageBytes - usage.storedBytes - storage.reservedBytes,
    ),
  };
}
