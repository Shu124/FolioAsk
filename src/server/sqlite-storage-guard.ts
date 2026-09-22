import type { DatabaseSync } from "node:sqlite";
import type { DocumentRecord } from "./documents.ts";
import { HttpError } from "./http.ts";
import {
  DEFAULT_STORAGE_POLICY,
  FREE_LIMITS,
  type StorageOperation,
  type StoragePolicy,
} from "./storage-limits.ts";

/** Local equivalent of the transactional storage RPCs in migration 006. */
export class SqliteStorageGuard {
  private db: DatabaseSync;
  private policy: StoragePolicy;
  constructor(db: DatabaseSync, policy: Partial<StoragePolicy> = {}) {
    this.db = db;
    this.policy = { ...DEFAULT_STORAGE_POLICY, ...policy };
    db.exec(`
      CREATE TABLE IF NOT EXISTS storage_allocations (
        id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, request_key TEXT NOT NULL,
        workspace_id TEXT NOT NULL, bytes INTEGER NOT NULL, content_hash TEXT NOT NULL,
        original_key TEXT NOT NULL, state TEXT NOT NULL, UNIQUE(owner_id,request_key));
      CREATE TABLE IF NOT EXISTS storage_operations (
        scope TEXT NOT NULL, operation TEXT NOT NULL, window INTEGER NOT NULL, count INTEGER NOT NULL,
        PRIMARY KEY(scope,operation));
      INSERT OR IGNORE INTO storage_allocations
        SELECT id,owner_id,request_key,workspace_id,json_extract(data,'$.bytes'),
          json_extract(data,'$.contentHash'),json_extract(data,'$.originalKey'),'committed' FROM documents;
    `);
  }
  snapshot(ownerId: string) {
    const pending = this.db
      .prepare(
        "SELECT coalesce(sum(bytes),0) AS bytes,count(*) AS uploads FROM storage_allocations WHERE owner_id=? AND state='pending'",
      )
      .get(ownerId)!;
    const total = Number(
      this.db
        .prepare(
          "SELECT coalesce(sum(bytes),0) AS bytes FROM storage_allocations",
        )
        .get()!.bytes,
    );
    return {
      reservedBytes: Number(pending.bytes),
      reservedUploads: Number(pending.uploads),
      uploadsPaused:
        !this.policy.uploadsEnabled ||
        total + this.policy.externalBytes >= this.policy.totalBytes,
    };
  }
  reserve(document: DocumentRecord): DocumentRecord | undefined {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const previous = this.db
        .prepare(
          "SELECT data FROM documents WHERE owner_id=? AND request_key=?",
        )
        .get(document.ownerId, document.requestKey);
      if (previous) {
        const saved: DocumentRecord = JSON.parse(String(previous.data));
        if (
          saved.contentHash !== document.contentHash ||
          saved.workspaceId !== document.workspaceId
        )
          throw new HttpError(
            409,
            "This retry key belongs to a different upload.",
          );
        this.db.exec("COMMIT");
        return saved;
      }
      if (
        !this.db
          .prepare("SELECT id FROM workspaces WHERE id=? AND owner_id=?")
          .get(document.workspaceId, document.ownerId)
      )
        throw new HttpError(404, "Workspace not found.");
      if (
        this.db
          .prepare(
            "SELECT id FROM storage_allocations WHERE owner_id=? AND request_key=?",
          )
          .get(document.ownerId, document.requestKey)
      )
        throw new HttpError(
          409,
          "This upload is still processing or awaiting storage verification. Retry the same file later; do not start another copy.",
          "UPLOAD_IN_PROGRESS",
        );
      const usage = this.db
        .prepare("SELECT uploads,storedBytes FROM usage WHERE owner_id=?")
        .get(document.ownerId);
      const snapshot = this.snapshot(document.ownerId);
      if (
        Number(usage?.uploads ?? 0) + snapshot.reservedUploads >=
        FREE_LIMITS.uploads
      )
        throw new HttpError(
          429,
          "Your free upload allowance is used or reserved by pending uploads. View upgrade options for more capacity.",
          "FREE_UPLOAD_LIMIT",
        );
      if (
        !Number.isSafeInteger(document.bytes) ||
        document.bytes <= 0 ||
        document.bytes > FREE_LIMITS.fileBytes
      )
        throw new HttpError(413, "Free files must be 10 MB or smaller.");
      if (
        Number(usage?.storedBytes ?? 0) +
          snapshot.reservedBytes +
          document.bytes >
        FREE_LIMITS.storageBytes
      )
        throw new HttpError(
          429,
          "Your free 30 MB storage allowance would be exceeded. View upgrade options for more capacity.",
          "FREE_STORAGE_LIMIT",
        );
      const total = Number(
        this.db
          .prepare(
            "SELECT coalesce(sum(bytes),0) AS bytes FROM storage_allocations",
          )
          .get()!.bytes,
      );
      if (
        !this.policy.uploadsEnabled ||
        total + this.policy.externalBytes + document.bytes >
          this.policy.totalBytes
      )
        throw new HttpError(
          503,
          "Uploads are temporarily paused by the shared storage safeguard. Upgrading will not bypass this pause. Saved documents remain available.",
          "STORAGE_PAUSED",
        );
      this.db
        .prepare(
          "INSERT INTO storage_allocations VALUES (?,?,?,?,?,?,?,'pending')",
        )
        .run(
          document.id,
          document.ownerId,
          document.requestKey,
          document.workspaceId,
          document.bytes,
          document.contentHash,
          document.originalKey,
        );
      this.db.exec("COMMIT");
      return undefined;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  /** Called inside commitUpload's transaction, never as an independent commit. */
  commit(document: DocumentRecord) {
    const changed = this.db
      .prepare(
        "UPDATE storage_allocations SET state='committed' WHERE id=? AND owner_id=? AND request_key=? AND workspace_id=? AND bytes=? AND content_hash=? AND original_key=? AND state='pending'",
      )
      .run(
        document.id,
        document.ownerId,
        document.requestKey,
        document.workspaceId,
        document.bytes,
        document.contentHash,
        document.originalKey,
      );
    if (!changed.changes)
      throw new HttpError(409, "A matching storage reservation is required.");
  }
  release(id: string, ownerId: string) {
    this.db
      .prepare(
        "DELETE FROM storage_allocations WHERE id=? AND owner_id=? AND state='pending'",
      )
      .run(id, ownerId);
  }
  admit(ownerId: string, operation: StorageOperation, now: number) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const date = new Date(now);
      const windows = [
        {
          scope: "global",
          window: Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1),
          limit:
            operation === "upload"
              ? this.policy.monthlyUploads
              : this.policy.monthlyReads,
        },
        {
          scope: `owner:${ownerId}`,
          window: Math.floor(now / 60_000) * 60_000,
          limit:
            operation === "upload"
              ? this.policy.uploadsPerMinute
              : this.policy.readsPerMinute,
        },
      ];
      for (const entry of windows) {
        const row = this.db
          .prepare(
            "SELECT window,count FROM storage_operations WHERE scope=? AND operation=?",
          )
          .get(entry.scope, operation);
        if (
          row &&
          Number(row.window) === entry.window &&
          Number(row.count) >= entry.limit
        )
          throw new HttpError(
            429,
            entry.scope === "global"
              ? "The shared storage request budget is reached. Try again later. Upgrading will not bypass this safeguard."
              : "Too many storage requests. Wait a minute and try again.",
            "STORAGE_RATE_LIMIT",
          );
        if (entry.limit <= 0)
          throw new HttpError(
            429,
            "Storage requests are paused.",
            "STORAGE_RATE_LIMIT",
          );
        this.db
          .prepare(
            "INSERT INTO storage_operations VALUES (?,?,?,1) ON CONFLICT(scope,operation) DO UPDATE SET window=excluded.window,count=CASE WHEN storage_operations.window=excluded.window THEN storage_operations.count+1 ELSE 1 END",
          )
          .run(entry.scope, operation, entry.window);
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}
