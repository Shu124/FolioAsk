import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { DocumentRecord } from "../../src/server/documents.ts";

test("PostgreSQL migrations enforce storage reservations, budgets and private RPC permissions", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key);",
    );
    const migrations = new URL("../../supabase/migrations/", import.meta.url);
    for (const file of (await readdir(migrations))
      .filter((name) => name.endsWith(".sql") && !/^(006|009)/.test(name))
      .sort())
      await db.exec(await readFile(new URL(file, migrations), "utf8"));
    async function owner() {
      const id = crypto.randomUUID(),
        workspace = crypto.randomUUID();
      await db.query("insert into auth.users values($1)", [id]);
      await db.query("insert into public.folio_workspaces values($1,$2,0,$3)", [
        workspace,
        id,
        JSON.stringify({
          id: workspace,
          ownerId: id,
          name: "Test",
          createdAt: 0,
        }),
      ]);
      return { id, workspace };
    }
    function document(
      account: { id: string; workspace: string },
      bytes = 10_000_000,
    ): DocumentRecord {
      const id = crypto.randomUUID();
      return {
        id,
        ownerId: account.id,
        workspaceId: account.workspace,
        name: "synthetic.pdf",
        contentHash: "test-hash",
        requestKey: crypto.randomUUID(),
        originalKey: `${account.id}/${id}`,
        bytes,
        pages: [],
        createdAt: 0,
        classification: "public-approved",
      };
    }
    async function uploadRpc(
      name: "folio_reserve_upload" | "folio_commit_upload",
      doc: DocumentRecord,
    ) {
      const result = await db.query<{
        result: { status?: number; code?: string; document?: DocumentRecord };
      }>(`select public.${name}($1::jsonb) as result`, [JSON.stringify(doc)]);
      return result.rows[0].result;
    }
    async function snapshot(id: string) {
      return (
        await db.query<{
          result: {
            reservedBytes: number;
            reservedUploads: number;
            uploadsPaused: boolean;
          };
        }>("select public.folio_storage_snapshot($1) as result", [id])
      ).rows[0].result;
    }
    const alice = await owner();
    const legacy = document(alice, 1_000_000);
    assert.equal(
      (await uploadRpc("folio_commit_upload", legacy)).document?.id,
      legacy.id,
    );
    await db.exec(
      await readFile(new URL("006_storage_safeguards.sql", migrations), "utf8"),
    );
    await db.exec(
      await readFile(
        new URL("009_real_document_uploads.sql", migrations),
        "utf8",
      ),
    );
    assert.equal(
      (
        await db.query<{ bytes: number }>(
          "select bytes::integer from public.folio_storage_allocations where id=$1",
          [legacy.id],
        )
      ).rows[0].bytes,
      1_000_000,
      "existing originals are backfilled",
    );
    assert.deepEqual(await snapshot(alice.id), {
      reservedBytes: 0,
      reservedUploads: 0,
      uploadsPaused: false,
    });
    assert.equal(
      (await uploadRpc("folio_commit_upload", document(alice))).status,
      409,
      "old clients cannot commit without a reservation",
    );
    const bob = await owner();
    const batch = Array.from({ length: 4 }, () => document(bob));
    const reserved = await Promise.all(
      batch.map((doc) => uploadRpc("folio_reserve_upload", doc)),
    );
    assert.equal(reserved.filter((r) => !r.status).length, 3);
    assert.equal(reserved[3].code, "FREE_UPLOAD_LIMIT");
    assert.deepEqual(await snapshot(bob.id), {
      reservedBytes: 30_000_000,
      reservedUploads: 3,
      uploadsPaused: false,
    });
    assert.equal(
      (await uploadRpc("folio_reserve_upload", batch[0])).code,
      "UPLOAD_IN_PROGRESS",
    );
    assert.equal(
      (await uploadRpc("folio_commit_upload", { ...batch[0], bytes: 1 }))
        .status,
      409,
    );
    for (const doc of batch.slice(0, 3))
      assert.equal(
        (await uploadRpc("folio_commit_upload", doc)).document?.id,
        doc.id,
      );
    assert.equal((await snapshot(bob.id)).reservedBytes, 0);
    assert.equal(
      (await uploadRpc("folio_reserve_upload", batch[0])).document?.id,
      batch[0].id,
    );
    await db.query("select public.folio_release_upload($1,$2)", [
      batch[0].id,
      bob.id,
    ]);
    assert.equal(
      (
        await db.query(
          "select id from public.folio_storage_allocations where id=$1",
          [batch[0].id],
        )
      ).rows.length,
      1,
      "release cannot erase committed accounting",
    );
    await db.query("select public.folio_set_document_trashed($1,$2,true,1)", [
      batch[0].id,
      bob.id,
    ]);
    assert.equal(
      (await uploadRpc("folio_reserve_upload", batch[3])).code,
      "FREE_UPLOAD_LIMIT",
    );

    const carol = await owner();
    const largeOwner = await owner();
    const largeFile = document(largeOwner, 30_000_000);
    assert.equal(
      (await uploadRpc("folio_reserve_upload", largeFile)).status,
      undefined,
    );
    assert.equal(
      (await uploadRpc("folio_reserve_upload", document(largeOwner, 1))).code,
      "FREE_STORAGE_LIMIT",
    );
    await db.query("select public.folio_release_upload($1,$2)", [
      largeFile.id,
      largeOwner.id,
    ]);
    assert.equal(
      (
        await uploadRpc(
          "folio_reserve_upload",
          document(largeOwner, 30_000_001),
        )
      ).status,
      413,
    );
    const saveProgress = (ownerId: string, chunks: unknown[]) =>
      db.query("select public.folio_save_index_progress($1,$2,$3,$4::jsonb)", [
        legacy.id,
        ownerId,
        "test-index",
        JSON.stringify(chunks),
      ]);
    await saveProgress(alice.id, [{ text: "one" }, { text: "two" }]);
    await saveProgress(alice.id, [{ text: "one" }]);
    const checkpoint = await db.query<{ data: unknown[] }>(
      "select data from public.folio_embeddings where document_id=$1",
      [legacy.id],
    );
    assert.equal(
      checkpoint.rows[0].data.length,
      2,
      "concurrent shorter checkpoint cannot replace progress",
    );
    await assert.rejects(saveProgress(bob.id, []), /Document not found/);
    await assert.rejects(
      saveProgress(alice.id, Array(301).fill({})),
      /Invalid index checkpoint/,
    );
    await db.exec("set role anon");
    await assert.rejects(saveProgress(alice.id, []), /permission denied/);
    await db.exec("reset role; set role authenticated");
    await assert.rejects(saveProgress(alice.id, []), /permission denied/);
    await db.exec("reset role; set role service_role");
    await saveProgress(alice.id, [
      { text: "one" },
      { text: "two" },
      { text: "three" },
    ]);
    await db.exec("reset role");
    await db.query(
      "insert into public.folio_usage(owner_id,stored_bytes) values ($1,29000000)",
      [carol.id],
    );
    assert.equal(
      (await uploadRpc("folio_reserve_upload", document(carol, 2_000_000)))
        .code,
      "FREE_STORAGE_LIMIT",
      "byte limit is independent of upload count",
    );
    await db.exec(
      "update public.folio_storage_policy set total_bytes=32000000",
    );
    const dave = await owner(),
      eve = await owner();
    const candidates = [document(dave, 1_000_000), document(eve, 1_000_000)];
    const acrossOwners = await Promise.all(
      candidates.map((doc) => uploadRpc("folio_reserve_upload", doc)),
    );
    assert.equal(acrossOwners.filter((r) => !r.status).length, 1);
    assert.equal(
      acrossOwners.filter((r) => r.code === "STORAGE_PAUSED").length,
      1,
    );
    assert.equal((await snapshot(alice.id)).uploadsPaused, true);
    await db.query("select public.folio_release_upload($1,$2)", [
      candidates[0].id,
      eve.id,
    ]);
    assert.equal(
      (await snapshot(alice.id)).uploadsPaused,
      true,
      "another owner cannot release a reservation",
    );
    await db.query("select public.folio_release_upload($1,$2)", [
      candidates[0].id,
      dave.id,
    ]);
    assert.equal((await snapshot(alice.id)).uploadsPaused, false);
    await db.exec(
      "update public.folio_storage_policy set external_bytes=1000000",
    );
    assert.equal(
      (await uploadRpc("folio_reserve_upload", candidates[0])).code,
      "STORAGE_PAUSED",
    );
    await db.exec(
      "update public.folio_storage_policy set external_bytes=0,uploads_enabled=false",
    );
    assert.equal(
      (await uploadRpc("folio_reserve_upload", candidates[0])).code,
      "STORAGE_PAUSED",
    );

    await db.exec(
      "update public.folio_storage_policy set monthly_uploads=2,uploads_per_minute=1,monthly_reads=1",
    );
    const now = Date.UTC(2026, 0, 1);
    const admit = async (id: string, operation: string, time: number) =>
      (
        await db.query<{ result: { status?: number } }>(
          "select public.folio_admit_storage_operation($1,$2,$3) as result",
          [id, operation, time],
        )
      ).rows[0].result;
    assert.equal((await admit(alice.id, "upload", now)).status, undefined);
    assert.equal((await admit(alice.id, "upload", now)).status, 429);
    assert.equal(
      (await admit(alice.id, "upload", now + 60_000)).status,
      undefined,
    );
    assert.equal((await admit(eve.id, "upload", now + 60_000)).status, 429);
    assert.equal(
      (await admit(eve.id, "upload", Date.UTC(2026, 1, 1))).status,
      undefined,
    );
    assert.equal((await admit(alice.id, "read", now)).status, undefined);
    assert.equal((await admit(eve.id, "read", now)).status, 429);

    await db.exec("set role service_role");
    await snapshot(alice.id);
    await db.exec("reset role; set role anon");
    await assert.rejects(snapshot(alice.id), /permission denied/);
    await assert.rejects(
      db.query("select * from public.folio_storage_policy"),
      /permission denied/,
    );
    await db.exec("reset role; set role authenticated");
    await assert.rejects(
      uploadRpc("folio_reserve_upload", document(eve)),
      /permission denied/,
    );
    await db.exec("reset role");
    await db.query("delete from auth.users where id=$1", [bob.id]);
    assert.equal(
      (
        await db.query(
          "select id from public.folio_storage_allocations where owner_id=$1",
          [bob.id],
        )
      ).rows.length,
      3,
      "account deletion cannot silently free space while objects remain in R2",
    );
  } finally {
    await db.close();
  }
});
