-- Apply after 003_answers.sql. Soft deletion retains originals, embeddings and usage.
create or replace function public.folio_set_document_trashed(p_id uuid,p_owner uuid,p_trashed boolean,p_now bigint) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_doc jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
  select data into v_doc from public.folio_documents where id=p_id and owner_id=p_owner for update;
  if v_doc is null then return jsonb_build_object('status',404,'error','Document not found.');end if;
  if p_trashed then
    if not (v_doc ? 'deletedAt') then v_doc:=jsonb_set(v_doc,'{deletedAt}',to_jsonb(p_now));end if;
  else v_doc:=v_doc-'deletedAt';
  end if;
  update public.folio_documents set data=v_doc where id=p_id and owner_id=p_owner;
  return jsonb_build_object('document',v_doc);
end $$;
revoke all on function public.folio_set_document_trashed(uuid,uuid,boolean,bigint) from public,anon,authenticated;
grant execute on function public.folio_set_document_trashed(uuid,uuid,boolean,bigint) to service_role;

create or replace function public.folio_commit_answer(p_answer jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_owner uuid:=(p_answer->>'ownerId')::uuid;v_workspace uuid:=(p_answer->>'workspaceId')::uuid;v_previous jsonb;v_count integer;v_doc jsonb;v_id text;
begin
  perform pg_advisory_xact_lock(hashtextextended(v_owner::text,0));
  if not exists(select 1 from public.folio_workspaces where id=v_workspace and owner_id=v_owner) then return jsonb_build_object('status',404,'error','Workspace not found.');end if;
  select data into v_previous from public.folio_answers where owner_id=v_owner and request_key=p_answer->>'requestKey';
  if v_previous is not null then
    if v_previous->>'fingerprint'<>p_answer->>'fingerprint' then return jsonb_build_object('status',409,'error','This retry key belongs to a different question.');end if;
    return jsonb_build_object('answer',v_previous);
  end if;
  for v_id in select jsonb_array_elements_text(p_answer->'documentIds') loop
    select data into v_doc from public.folio_documents where id=v_id::uuid and owner_id=v_owner and workspace_id=v_workspace;
    if v_doc is null then return jsonb_build_object('status',404,'error','Selected document not found.');end if;
    if v_doc ? 'deletedAt' then return jsonb_build_object('status',410,'error','This document is in Trash. Restore it before asking a new question.');end if;
  end loop;
  insert into public.folio_usage(owner_id) values(v_owner) on conflict do nothing;
  select answers into v_count from public.folio_usage where owner_id=v_owner;
  if v_count>=20 then return jsonb_build_object('status',429,'error','Your 20 lifetime answers are used. Saved work remains available.');end if;
  insert into public.folio_answers(id,owner_id,workspace_id,request_key,created_at,data) values((p_answer->>'id')::uuid,v_owner,v_workspace,p_answer->>'requestKey',(p_answer->>'createdAt')::bigint,p_answer);
  update public.folio_usage set answers=answers+1 where owner_id=v_owner;
  return jsonb_build_object('answer',p_answer);
end $$;
revoke all on function public.folio_commit_answer(jsonb) from public,anon,authenticated;
grant execute on function public.folio_commit_answer(jsonb) to service_role;
