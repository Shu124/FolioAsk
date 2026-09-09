import { DatabaseSync } from "node:sqlite";
import type { Session, Store, Workspace } from "./contracts.ts";
import type {
  BlobStore,
  DocumentStore,
  DocumentRecord,
  Usage,
} from "./documents.ts";
import { HttpError } from "./http.ts";

/** Local development/test persistence only; not imported by the Cloudflare entry. */
export class SqliteStore implements Store, DocumentStore, BlobStore {
  private db: DatabaseSync;
  constructor(filename: string) {
    this.db = new DatabaseSync(filename);
    this.db.exec(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, workspace_id TEXT NOT NULL, request_key TEXT NOT NULL, data TEXT NOT NULL, UNIQUE(owner_id,request_key));
      CREATE TABLE IF NOT EXISTS usage (owner_id TEXT PRIMARY KEY, uploads INTEGER NOT NULL DEFAULT 0, processedPages INTEGER NOT NULL DEFAULT 0, storedBytes INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS blobs (key TEXT PRIMARY KEY, bytes BLOB NOT NULL);`);
  }
  close() {
    this.db.close();
  }
  async putSession(session: Session) {
    this.db
      .prepare("INSERT INTO sessions VALUES (?, ?)")
      .run(session.hash, JSON.stringify(session));
  }
  async getSession(hash: string): Promise<Session | undefined> {
    const row = this.db
      .prepare("SELECT data FROM sessions WHERE hash = ?")
      .get(hash);
    return row ? JSON.parse(String(row.data)) : undefined;
  }
  async deleteSession(hash: string) {
    this.db.prepare("DELETE FROM sessions WHERE hash = ?").run(hash);
  }
  async listWorkspaces(ownerId: string): Promise<Workspace[]> {
    return this.db
      .prepare(
        "SELECT data FROM workspaces WHERE owner_id = ? ORDER BY rowid DESC",
      )
      .all(ownerId)
      .map((row) => JSON.parse(String(row.data)));
  }
  async getWorkspace(
    id: string,
    ownerId: string,
  ): Promise<Workspace | undefined> {
    const row = this.db
      .prepare("SELECT data FROM workspaces WHERE id = ? AND owner_id = ?")
      .get(id, ownerId);
    return row ? JSON.parse(String(row.data)) : undefined;
  }
  async putWorkspace(workspace: Workspace) {
    this.db
      .prepare(
        "INSERT INTO workspaces VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data WHERE workspaces.owner_id = excluded.owner_id",
      )
      .run(workspace.id, workspace.ownerId, JSON.stringify(workspace));
  }
  async put(key: string, bytes: Uint8Array) {
    this.db.prepare("INSERT INTO blobs VALUES (?, ?)").run(key, bytes);
  }
  async get(key: string) {
    const row = this.db.prepare("SELECT bytes FROM blobs WHERE key=?").get(key);
    return row ? new Uint8Array(row.bytes as Uint8Array) : undefined;
  }
  async delete(key: string) {
    this.db.prepare("DELETE FROM blobs WHERE key=?").run(key);
  }
  async getDocument(
    id: string,
    ownerId: string,
  ): Promise<DocumentRecord | undefined> {
    const row = this.db
      .prepare("SELECT data FROM documents WHERE id=? AND owner_id=?")
      .get(id, ownerId);
    return row ? JSON.parse(String(row.data)) : undefined;
  }
  async findUpload(
    ownerId: string,
    requestKey: string,
  ): Promise<DocumentRecord | undefined> {
    const row = this.db
      .prepare("SELECT data FROM documents WHERE owner_id=? AND request_key=?")
      .get(ownerId, requestKey);
    return row ? JSON.parse(String(row.data)) : undefined;
  }
  async listDocuments(
    workspaceId: string,
    ownerId: string,
  ): Promise<DocumentRecord[]> {
    return this.db
      .prepare(
        "SELECT data FROM documents WHERE owner_id=? AND workspace_id=? ORDER BY rowid",
      )
      .all(ownerId, workspaceId)
      .map((row) => JSON.parse(String(row.data)));
  }
  async usage(ownerId: string): Promise<Usage> {
    const row = this.db
      .prepare(
        "SELECT uploads,processedPages,storedBytes FROM usage WHERE owner_id=?",
      )
      .get(ownerId);
    return row
      ? {
          uploads: Number(row.uploads),
          processedPages: Number(row.processedPages),
          storedBytes: Number(row.storedBytes),
        }
      : { uploads: 0, processedPages: 0, storedBytes: 0 };
  }
  async commitUpload(document: DocumentRecord): Promise<DocumentRecord> {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const row = this.db
        .prepare(
          "SELECT data FROM documents WHERE owner_id=? AND request_key=?",
        )
        .get(document.ownerId, document.requestKey);
      if (row) {
        const existing: DocumentRecord = JSON.parse(String(row.data));
        if (
          existing.contentHash !== document.contentHash ||
          existing.workspaceId !== document.workspaceId
        )
          throw new HttpError(
            409,
            "This retry key belongs to a different upload.",
          );
        this.db.exec("COMMIT");
        return existing;
      }
      this.db
        .prepare("INSERT OR IGNORE INTO usage(owner_id) VALUES (?)")
        .run(document.ownerId);
      const changed = this.db
        .prepare(
          "UPDATE usage SET uploads=uploads+1,processedPages=processedPages+?,storedBytes=storedBytes+? WHERE owner_id=? AND uploads<3",
        )
        .run(document.pages.length, document.bytes, document.ownerId);
      if (!changed.changes)
        throw new HttpError(
          429,
          "Your 3 lifetime uploads are used. Saved documents remain available.",
        );
      this.db
        .prepare("INSERT INTO documents VALUES (?,?,?,?,?)")
        .run(
          document.id,
          document.ownerId,
          document.workspaceId,
          document.requestKey,
          JSON.stringify(document),
        );
      this.db.exec("COMMIT");
      return document;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}
