import { DatabaseSync } from "node:sqlite";
import type { Session, Store, Workspace } from "./contracts.ts";

/** Local development/test persistence only; not imported by the Cloudflare entry. */
export class SqliteStore implements Store {
  private db: DatabaseSync;
  constructor(filename: string) {
    this.db = new DatabaseSync(filename);
    this.db.exec(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, data TEXT NOT NULL);`);
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
}
