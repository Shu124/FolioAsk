import { DatabaseSync } from "node:sqlite";
import type { Session, Store, Workspace } from "./contracts.ts";
import type {
  BlobStore,
  DocumentStore,
  DocumentRecord,
  Usage,
} from "./documents.ts";
import { HttpError } from "./http.ts";
import type { Conversation, ConversationChange } from "./conversations.ts";
import type { AnswerStore, AnswerRecord, IndexedChunk } from "./answers.ts";
import type { ActivityStore, ActiveTime } from "./activity.ts";
import { SqliteStorageGuard } from "./sqlite-storage-guard.ts";
import {
  FREE_LIMITS,
  type StorageOperation,
  type StoragePolicy,
} from "./storage-limits.ts";

/** Local development/test persistence only; not imported by the Cloudflare entry. */
export class SqliteStore
  implements Store, DocumentStore, BlobStore, AnswerStore, ActivityStore
{
  private db: DatabaseSync;
  private storageGuard: SqliteStorageGuard;
  constructor(filename: string, storagePolicy: Partial<StoragePolicy> = {}) {
    this.db = new DatabaseSync(filename);
    this.db.exec(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS active_time (owner_id TEXT NOT NULL,workspace_id TEXT NOT NULL,bucket INTEGER NOT NULL,milliseconds INTEGER NOT NULL,PRIMARY KEY(owner_id,bucket));
      CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, workspace_id TEXT NOT NULL, request_key TEXT NOT NULL, data TEXT NOT NULL, UNIQUE(owner_id,request_key));
      CREATE TABLE IF NOT EXISTS usage (owner_id TEXT PRIMARY KEY, uploads INTEGER NOT NULL DEFAULT 0, processedPages INTEGER NOT NULL DEFAULT 0, storedBytes INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS blobs (key TEXT PRIMARY KEY, bytes BLOB NOT NULL);
      CREATE TABLE IF NOT EXISTS answers (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, workspace_id TEXT NOT NULL, request_key TEXT NOT NULL, data TEXT NOT NULL,UNIQUE(owner_id,request_key));
      CREATE TABLE IF NOT EXISTS embeddings (document_id TEXT NOT NULL,owner_id TEXT NOT NULL,index_key TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(document_id,index_key));`);
    if (
      !this.db
        .prepare("PRAGMA table_info(usage)")
        .all()
        .some((column) => column.name === "answers")
    )
      this.db.exec(
        "ALTER TABLE usage ADD COLUMN answers INTEGER NOT NULL DEFAULT 0",
      );
    this.storageGuard = new SqliteStorageGuard(this.db, storagePolicy);
    this.db
      .exec(`CREATE TABLE IF NOT EXISTS conversations (id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,workspace_id TEXT NOT NULL,data TEXT NOT NULL);
      INSERT OR IGNORE INTO conversations
      WITH ordered_answers AS (SELECT *,first_value(json_extract(data,'$.question')) OVER
        (PARTITION BY coalesce(json_extract(data,'$.threadId'),id),owner_id,workspace_id ORDER BY json_extract(data,'$.createdAt'),id) AS first_question FROM answers)
      SELECT coalesce(json_extract(data,'$.threadId'),id),owner_id,workspace_id,
      json_object('id',coalesce(json_extract(data,'$.threadId'),id),'ownerId',owner_id,'workspaceId',workspace_id,
      'title',substr(first_question,1,100),'archived',json('false'),
      'createdAt',min(json_extract(data,'$.createdAt')),'updatedAt',max(json_extract(data,'$.createdAt')))
      FROM ordered_answers GROUP BY coalesce(json_extract(data,'$.threadId'),id),owner_id,workspace_id;`);
  }
  async storageSnapshot(ownerId: string) {
    return this.storageGuard.snapshot(ownerId);
  }
  async admitStorageOperation(
    ownerId: string,
    operation: StorageOperation,
    now: number,
  ) {
    this.storageGuard.admit(ownerId, operation, now);
  }
  async reserveUpload(document: DocumentRecord) {
    return this.storageGuard.reserve(document);
  }
  async releaseUpload(id: string, ownerId: string) {
    this.storageGuard.release(id, ownerId);
  }
  close() {
    this.db.close();
  }
  async recordActiveTime(
    ownerId: string,
    workspaceId: string,
    bucket: number,
    milliseconds: number,
  ) {
    this.db
      .prepare(
        "INSERT INTO active_time VALUES (?,?,?,?) ON CONFLICT(owner_id,bucket) DO UPDATE SET milliseconds=max(active_time.milliseconds,excluded.milliseconds) WHERE active_time.workspace_id=excluded.workspace_id",
      )
      .run(ownerId, workspaceId, bucket, milliseconds);
  }
  async activeTime(ownerId: string, workspaceId: string): Promise<ActiveTime> {
    const row = this.db
      .prepare(
        "SELECT coalesce(sum(milliseconds),0) AS milliseconds,min(bucket) AS startedAt FROM active_time WHERE owner_id=? AND workspace_id=?",
      )
      .get(ownerId, workspaceId)!;
    return {
      milliseconds: Number(row.milliseconds),
      ...(row.startedAt === null ? {} : { startedAt: Number(row.startedAt) }),
    };
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
  async deleteAccountSessions(ownerId: string) {
    this.db
      .prepare(
        "DELETE FROM sessions WHERE json_extract(data, '$.account.id') = ?",
      )
      .run(ownerId);
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
  async setDocumentTrashed(
    id: string,
    ownerId: string,
    trashed: boolean,
    now: number,
  ): Promise<DocumentRecord> {
    const row = this.db
      .prepare(
        trashed
          ? "UPDATE documents SET data=json_set(data,'$.deletedAt',coalesce(json_extract(data,'$.deletedAt'),?)) WHERE id=? AND owner_id=? RETURNING data"
          : "UPDATE documents SET data=json_remove(data,'$.deletedAt') WHERE id=? AND owner_id=? RETURNING data",
      )
      .get(...(trashed ? [now, id, ownerId] : [id, ownerId]));
    if (!row) throw new HttpError(404, "Document not found.");
    return JSON.parse(String(row.data));
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
        "SELECT uploads,processedPages,storedBytes,answers FROM usage WHERE owner_id=?",
      )
      .get(ownerId);
    return row
      ? {
          uploads: Number(row.uploads),
          answers: Number(row.answers),
          processedPages: Number(row.processedPages),
          storedBytes: Number(row.storedBytes),
        }
      : { uploads: 0, processedPages: 0, storedBytes: 0, answers: 0 };
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
      this.storageGuard.commit(document);
      const changed = this.db
        .prepare(
          "UPDATE usage SET uploads=uploads+1,processedPages=processedPages+?,storedBytes=storedBytes+? WHERE owner_id=? AND uploads<? AND storedBytes+?<=?",
        )
        .run(
          document.pages.length,
          document.bytes,
          document.ownerId,
          FREE_LIMITS.uploads,
          document.bytes,
          FREE_LIMITS.storageBytes,
        );
      if (!changed.changes)
        throw new HttpError(
          429,
          "Your free upload or storage allowance is reached. View upgrade options for more capacity. Saved documents remain available.",
          "FREE_UPLOAD_LIMIT",
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
  async findAnswer(
    ownerId: string,
    requestKey: string,
  ): Promise<AnswerRecord | undefined> {
    const row = this.db
      .prepare("SELECT data FROM answers WHERE owner_id=? AND request_key=?")
      .get(ownerId, requestKey);
    return row ? JSON.parse(String(row.data)) : undefined;
  }
  async listConversations(
    ownerId: string,
    workspaceId: string,
  ): Promise<Conversation[]> {
    return this.db
      .prepare(
        "SELECT data FROM conversations WHERE owner_id=? AND workspace_id=? AND json_extract(data,'$.deletedAt') IS NULL ORDER BY json_extract(data,'$.updatedAt') DESC",
      )
      .all(ownerId, workspaceId)
      .map((row) => JSON.parse(String(row.data)));
  }
  async changeConversation(
    ownerId: string,
    workspaceId: string,
    id: string,
    change: ConversationChange,
  ): Promise<Conversation> {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const row = this.db
        .prepare(
          "SELECT data FROM conversations WHERE id=? AND owner_id=? AND workspace_id=?",
        )
        .get(id, ownerId, workspaceId);
      const chat: Conversation | undefined = row
        ? JSON.parse(String(row.data))
        : undefined;
      if (!chat || chat.deletedAt !== undefined)
        throw new HttpError(404, "Conversation not found.");
      Object.assign(chat, change);
      if (chat.deletedAt !== undefined) {
        chat.title = "";
        this.db
          .prepare(
            "DELETE FROM answers WHERE owner_id=? AND workspace_id=? AND coalesce(json_extract(data,'$.threadId'),id)=?",
          )
          .run(ownerId, workspaceId, id);
      }
      this.db
        .prepare("UPDATE conversations SET data=? WHERE id=?")
        .run(JSON.stringify(chat), id);
      this.db.exec("COMMIT");
      return chat;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  async listAnswers(
    ownerId: string,
    workspaceId: string,
  ): Promise<AnswerRecord[]> {
    return this.db
      .prepare(
        "SELECT data FROM answers WHERE owner_id=? AND workspace_id=? ORDER BY rowid",
      )
      .all(ownerId, workspaceId)
      .map((row) => JSON.parse(String(row.data)));
  }
  async getIndex(
    documentId: string,
    ownerId: string,
    indexKey: string,
  ): Promise<IndexedChunk[] | undefined> {
    const row = this.db
      .prepare(
        "SELECT data FROM embeddings WHERE document_id=? AND owner_id=? AND index_key=?",
      )
      .get(documentId, ownerId, indexKey);
    return row ? JSON.parse(String(row.data)) : undefined;
  }
  async putIndex(
    documentId: string,
    ownerId: string,
    indexKey: string,
    chunks: IndexedChunk[],
  ) {
    this.db
      .prepare(
        "INSERT INTO embeddings VALUES (?,?,?,?) ON CONFLICT(document_id,index_key) DO UPDATE SET data=excluded.data WHERE embeddings.owner_id=excluded.owner_id",
      )
      .run(documentId, ownerId, indexKey, JSON.stringify(chunks));
  }
  async commitAnswer(answer: AnswerRecord): Promise<AnswerRecord> {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const thread = answer.threadId ?? answer.id;
      const existing = this.db
        .prepare("SELECT data FROM conversations WHERE id=?")
        .get(thread);
      const chat: Conversation = existing
        ? JSON.parse(String(existing.data))
        : {
            id: thread,
            ownerId: answer.ownerId,
            workspaceId: answer.workspaceId,
            title: answer.question.slice(0, 100),
            archived: false,
            createdAt: answer.createdAt,
            updatedAt: answer.createdAt,
          };
      if (
        chat.ownerId !== answer.ownerId ||
        chat.workspaceId !== answer.workspaceId
      )
        throw new HttpError(404, "Conversation not found.");
      if (chat.deletedAt !== undefined)
        throw new HttpError(
          410,
          "This conversation was deleted. Start a new chat.",
        );
      if (chat.archived)
        throw new HttpError(
          409,
          "Restore this conversation before asking another question.",
        );
      for (const id of answer.documentIds) {
        const source = this.db
          .prepare(
            "SELECT data FROM documents WHERE id=? AND owner_id=? AND workspace_id=?",
          )
          .get(id, answer.ownerId, answer.workspaceId);
        if (!source) throw new HttpError(404, "Selected document not found.");
        if (JSON.parse(String(source.data)).deletedAt !== undefined)
          throw new HttpError(
            410,
            "This document is in Trash. Restore it before asking a new question.",
          );
      }
      const row = this.db
        .prepare("SELECT data FROM answers WHERE owner_id=? AND request_key=?")
        .get(answer.ownerId, answer.requestKey);
      if (row) {
        const previous: AnswerRecord = JSON.parse(String(row.data));
        if (previous.fingerprint !== answer.fingerprint)
          throw new HttpError(
            409,
            "This retry key belongs to a different question.",
          );
        this.db.exec("COMMIT");
        return previous;
      }
      this.db
        .prepare("INSERT OR IGNORE INTO usage(owner_id) VALUES (?)")
        .run(answer.ownerId);
      const updated = this.db
        .prepare(
          "UPDATE usage SET answers=answers+1 WHERE owner_id=? AND answers<20",
        )
        .run(answer.ownerId);
      if (!updated.changes)
        throw new HttpError(
          429,
          "Your 20 lifetime answers are used. Saved work remains available.",
        );
      this.db
        .prepare("INSERT INTO answers VALUES (?,?,?,?,?)")
        .run(
          answer.id,
          answer.ownerId,
          answer.workspaceId,
          answer.requestKey,
          JSON.stringify(answer),
        );
      chat.updatedAt = Math.max(chat.updatedAt, answer.createdAt);
      this.db
        .prepare(
          "INSERT INTO conversations VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
        )
        .run(chat.id, chat.ownerId, chat.workspaceId, JSON.stringify(chat));
      this.db.exec("COMMIT");
      return answer;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}
