begin;
alter table public.cms_sites add column if not exists imported_at timestamptz;
create or replace function public.cms_import_seed(s uuid,entries jsonb) returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare entry jsonb;pid uuid;rid uuid;imported timestamptz;begin
 select imported_at into imported from cms_sites where id=s for update;
 if not found then raise exception 'SITE_REQUIRED';end if;
 if imported is not null then return 'already_imported';end if;
 if jsonb_array_length(entries)<>38 then raise exception 'EXPECTED_38_RECORDS';end if;
 for entry in select value from jsonb_array_elements(entries) loop
  insert into cms_pages(site_id,route,locale,is_legacy,draft) values(s,entry->>'route',entry->>'locale',true,entry->'document') on conflict(site_id,route,locale) do nothing returning id into pid;
  if pid is null then raise exception 'EXISTING_CONTENT_REQUIRES_REVIEW';end if;
  insert into cms_revisions(site_id,page_id,version,document) values(s,pid,1,entry->'document') returning id into rid;
  update cms_pages set published_revision=rid where id=pid;
 end loop;
 update cms_sites set imported_at=now() where id=s;
 insert into cms_audit(site_id,event,subject)values(s,'initial_import',s::text);
 return 'imported';end $$;
create or replace function public.cms_export_snapshot(s uuid) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
select jsonb_build_object(
 'cms_sites',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from cms_sites x where id=s),
 'cms_memberships',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from cms_memberships x where site_id=s),
 'cms_pages',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from cms_pages x where site_id=s),
 'cms_revisions',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from cms_revisions x where site_id=s),
 'cms_media',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from cms_media x where site_id=s),
 'cms_ai_tasks',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from cms_ai_tasks x where site_id=s),
 'cms_audit',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from cms_audit x where site_id=s),
 'cms_usage',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from cms_usage x where site_id=s)
) $$;
revoke all on function public.cms_import_seed(uuid,jsonb),public.cms_export_snapshot(uuid) from public,anon,authenticated;
grant execute on function public.cms_import_seed(uuid,jsonb),public.cms_export_snapshot(uuid) to service_role;
commit;
