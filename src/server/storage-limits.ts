import type { DocumentRecord } from "./documents.ts";

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
