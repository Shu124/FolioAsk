import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("conversation migration preserves legacy messages and serializes archive/delete with answer commits", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key);",
    );
    const dir = new URL("../../supabase/migrations/", import.meta.url);
    for (const file of (await readdir(dir))
      .filter((f) => f.endsWith(".sql") && f < "008")
      .sort())
      await db.exec(await readFile(new URL(file, dir), "utf8"));
    const owner = crypto.randomUUID(),
      workspace = crypto.randomUUID(),
      id = crypto.randomUUID();
    await db.query("insert into auth.users values($1)", [owner]);
    await db.query("insert into public.folio_workspaces values($1,$2,0,$3)", [
      workspace,
      owner,
      JSON.stringify({ id: workspace, ownerId: owner }),
    ]);
    const answer = {
      id,
      ownerId: owner,
      workspaceId: workspace,
      requestKey: crypto.randomUUID(),
      fingerprint: "test",
      question: "Legacy question",
      createdAt: 1,
      documentIds: [],
      text: "Saved text",
      citations: [],
    };
    await db.query("select public.folio_commit_answer($1::jsonb)", [
      JSON.stringify(answer),
    ]);
    await db.exec(
      await readFile(new URL("008_conversations.sql", dir), "utf8"),
    );
    const rows = await db.query<{ data: { title: string } }>(
      "select data from public.folio_conversations",
    );
    assert.equal(rows.rows[0].data.title, "Legacy question");
    const manage = async (
      change: unknown,
      account = owner,
      project = workspace,
    ) =>
      (
        await db.query<{
          result: { status?: number; conversation?: { title: string } };
        }>(
          "select public.folio_manage_conversation($1,$2,$3,$4::jsonb) as result",
          [account, project, id, JSON.stringify(change)],
        )
      ).rows[0].result;
    assert.equal(
      (await manage({ title: "New title" })).conversation?.title,
      "New title",
    );
    assert.equal(
      (await manage({ archived: true }, crypto.randomUUID())).status,
      404,
    );
    assert.equal(
      (await manage({ archived: true }, owner, crypto.randomUUID())).status,
      404,
    );
    await manage({ archived: true });
    const followup = {
      ...answer,
      id: crypto.randomUUID(),
      threadId: id,
      requestKey: crypto.randomUUID(),
      createdAt: 2,
    };
    const commit = async () =>
      (
        await db.query<{ result: { status?: number } }>(
          "select public.folio_commit_answer($1::jsonb) as result",
          [JSON.stringify(followup)],
        )
      ).rows[0].result;
    assert.equal((await commit()).status, 409);
    await manage({ archived: false });
    assert.equal((await commit()).status, undefined);
    await manage({ deletedAt: 3 });
    assert.equal((await commit()).status, 410);
    assert.equal(
      (await db.query("select * from public.folio_answers")).rows.length,
      0,
    );
    assert.equal(
      (
        await db.query<{ answers: number }>(
          "select answers from public.folio_usage where owner_id=$1",
          [owner],
        )
      ).rows[0].answers,
      2,
    );
    assert.equal((await manage({ title: "Resurrect" })).status, 404);
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      await assert.rejects(
        db.query("select * from public.folio_conversations"),
      );
      await assert.rejects(
        db.query(
          "select public.folio_manage_conversation($1,$2,$3,'{}'::jsonb)",
          [owner, workspace, id],
        ),
      );
      await db.exec("reset role");
    }
  } finally {
    await db.close();
  }
});
