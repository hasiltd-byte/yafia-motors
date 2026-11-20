begin;
create or replace function public.cms_restore_snapshot(s uuid,snapshot jsonb) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare name text;item jsonb;seq int;published_id uuid;published_doc jsonb;begin
 perform 1 from cms_sites where id=s for update;
 foreach name in array array['cms_memberships','cms_pages','cms_revisions','cms_media','cms_ai_tasks','cms_usage'] loop
  for item in select value from jsonb_array_elements(snapshot->name) loop
   if (item->>'site_id')::uuid<>s then raise exception 'SITE_MISMATCH';end if;
  end loop;
 end loop;
 if not exists(select 1 from jsonb_array_elements(snapshot->'cms_memberships') x where x->>'role'='admin') then raise exception 'ADMIN_REQUIRED';end if;
 -- Keep historical drafts, but remove pages created after the backup from public view.
 update cms_pages set published_revision=null where site_id=s and id not in(select (x->>'id')::uuid from jsonb_array_elements(snapshot->'cms_pages') x);
 insert into cms_pages select * from jsonb_populate_recordset(null::cms_pages,snapshot->'cms_pages') on conflict(id) do nothing;
 insert into cms_revisions select * from jsonb_populate_recordset(null::cms_revisions,snapshot->'cms_revisions') on conflict do nothing;
 for item in select value from jsonb_array_elements(snapshot->'cms_pages') loop
  select coalesce(max(version),0) into seq from cms_revisions where page_id=(item->>'id')::uuid and site_id=s;
  published_id=null;
  if item->>'published_revision' is not null then
   select x->'document' into published_doc from jsonb_array_elements(snapshot->'cms_revisions') x where x->>'id'=item->>'published_revision';
   if published_doc is null then raise exception 'PUBLISHED_REVISION_MISSING';end if;
   seq=seq+1;
   insert into cms_revisions(site_id,page_id,version,document) values(s,(item->>'id')::uuid,seq,published_doc) returning id into published_id;
  end if;
  seq=seq+1;
  insert into cms_revisions(site_id,page_id,version,document) values(s,(item->>'id')::uuid,seq,item->'draft');
  update cms_pages set draft=item->'draft',version=seq,published_revision=published_id,updated_at=now() where id=(item->>'id')::uuid and site_id=s;
 end loop;
 insert into cms_media select * from jsonb_populate_recordset(null::cms_media,snapshot->'cms_media') on conflict(id) do update set ready=excluded.ready,alt=excluded.alt,credit=excluded.credit where cms_media.site_id=s;
 delete from cms_memberships where site_id=s;
 insert into cms_memberships select * from jsonb_populate_recordset(null::cms_memberships,snapshot->'cms_memberships');
 insert into cms_ai_tasks select * from jsonb_populate_recordset(null::cms_ai_tasks,snapshot->'cms_ai_tasks') on conflict(id) do nothing;
 update cms_ai_tasks set status='cancelled',progress='המשימה בוטלה בעת שחזור האתר',updated_at=now() where site_id=s and status in('queued','running');
 insert into cms_usage select * from jsonb_populate_recordset(null::cms_usage,snapshot->'cms_usage') on conflict(id) do nothing;
 update cms_sites set ai_enabled=false where id=s;
 perform cms_refresh_media(s);
 insert into cms_audit(site_id,event,subject) values(s,'snapshot_restored',s::text);
end $$;
revoke all on function public.cms_restore_snapshot(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.cms_restore_snapshot(uuid,jsonb) to service_role;
commit;
