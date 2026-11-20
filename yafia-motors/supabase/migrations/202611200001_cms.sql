begin;
create extension if not exists pgcrypto;
create table if not exists public.cms_sites(id uuid primary key, name text not null, origin text not null, monthly_budget_usd numeric(12,4) not null default 0 check(monthly_budget_usd>=0), ai_enabled boolean not null default false);
create table if not exists public.cms_memberships(site_id uuid references public.cms_sites on delete cascade, user_id uuid references auth.users on delete cascade, role text not null check(role in('admin','editor')), primary key(site_id,user_id));
create table if not exists public.cms_pages(id uuid primary key default gen_random_uuid(),site_id uuid not null references public.cms_sites,route text not null,locale text not null check(locale in('he','ar')),is_legacy boolean not null default false,draft jsonb not null,version int not null default 1,published_revision uuid,updated_at timestamptz not null default now(),unique(site_id,route,locale));
create table if not exists public.cms_revisions(id uuid primary key default gen_random_uuid(),site_id uuid not null references public.cms_sites,page_id uuid not null references public.cms_pages,version int not null,document jsonb not null,created_by uuid references auth.users,created_at timestamptz not null default now(),unique(page_id,version));
create table if not exists public.cms_media(id uuid primary key default gen_random_uuid(),site_id uuid not null references public.cms_sites,owner_id uuid not null references auth.users,path text not null unique,name text not null,mime text not null,size bigint not null check(size>0 and size<=209715200),ready boolean not null default false,published boolean not null default false,alt jsonb not null default '{"he":"","ar":""}',credit text not null default '',created_at timestamptz not null default now());
create table if not exists public.cms_ai_tasks(id uuid primary key default gen_random_uuid(),site_id uuid not null references public.cms_sites,created_by uuid not null references auth.users,prompt text not null,status text not null default 'queued' check(status in('queued','running','completed','failed','cancelled')),progress text not null default '',result jsonb,error text,run_id text,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table if not exists public.cms_audit(id bigint generated always as identity primary key,site_id uuid not null references public.cms_sites,actor uuid,event text not null,subject text,details jsonb not null default '{}',created_at timestamptz not null default now());
create table if not exists public.cms_usage(id uuid primary key default gen_random_uuid(),site_id uuid not null references public.cms_sites,provider text not null,reserved_usd numeric(12,6) not null,actual_usd numeric(12,6),created_at timestamptz not null default now());
create table if not exists public.cms_rate_limits(site_id uuid not null references public.cms_sites,bucket text not null,window_start timestamptz not null,count int not null,primary key(site_id,bucket,window_start));
create index if not exists cms_pages_published on public.cms_pages(site_id,locale) where published_revision is not null;
create index if not exists cms_usage_month on public.cms_usage(site_id,created_at);
create index if not exists cms_tasks_site on public.cms_ai_tasks(site_id,created_at desc);
create or replace function public.cms_role(s uuid) returns text language sql stable security definer set search_path=public,pg_temp as $$ select role from cms_memberships where site_id=s and user_id=auth.uid() $$;
alter table public.cms_sites enable row level security;
alter table public.cms_memberships enable row level security;
alter table public.cms_pages enable row level security;
alter table public.cms_revisions enable row level security;
alter table public.cms_media enable row level security;
alter table public.cms_ai_tasks enable row level security;
alter table public.cms_audit enable row level security;
alter table public.cms_usage enable row level security;
alter table public.cms_rate_limits enable row level security;
drop policy if exists site_read on public.cms_sites;create policy site_read on public.cms_sites for select to authenticated using(cms_role(id) is not null);
drop policy if exists site_update on public.cms_sites;create policy site_update on public.cms_sites for update to authenticated using(cms_role(id)='admin') with check(cms_role(id)='admin');
do $$ declare t text;begin foreach t in array array['cms_memberships','cms_pages','cms_revisions','cms_media','cms_ai_tasks','cms_audit','cms_usage'] loop execute format('drop policy if exists staff_read on public.%I',t);execute format('create policy staff_read on public.%I for select to authenticated using(public.cms_role(site_id) is not null)',t);end loop;end $$;
-- All writes to pages, revisions, membership, audit and tasks go through server/RPCs.
create or replace function public.cms_public_page(s uuid,r text,l text) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$ select v.document from cms_pages p join cms_revisions v on v.id=p.published_revision and v.page_id=p.id and v.site_id=p.site_id where p.site_id=s and p.route=r and p.locale=l $$;
create or replace function public.cms_public_index(s uuid) returns table(route text,locale text,updated_at timestamptz,title text,description text) language sql stable security definer set search_path=public,pg_temp as $$ select p.route,p.locale,v.created_at,v.document->>'title',v.document->>'description' from cms_pages p join cms_revisions v on v.id=p.published_revision and v.page_id=p.id and v.site_id=p.site_id where p.site_id=s and p.route<>'@shell' $$;
create or replace function public.cms_save_bundle(s uuid,items jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare item jsonb;p cms_pages;v uuid;output jsonb:='[]';begin
 if cms_role(s) is null then raise exception 'FORBIDDEN';end if;
 if jsonb_array_length(items) not between 1 and 2 then raise exception 'INVALID_BUNDLE';end if;
 for item in select value from jsonb_array_elements(items) order by value->>'id' loop
  select * into p from cms_pages where id=(item->>'id')::uuid and site_id=s for update;
  if not found then raise exception 'NOT_FOUND';end if;
  if p.version<>(item->>'version')::int then raise exception 'VERSION_CONFLICT';end if;
  update cms_pages set draft=item->'document',version=version+1,updated_at=now() where id=p.id;
  insert into cms_revisions(site_id,page_id,version,document,created_by) values(s,p.id,p.version+1,item->'document',auth.uid()) returning id into v;
  insert into cms_audit(site_id,actor,event,subject) values(s,auth.uid(),'draft_saved',p.id::text);
  output=output||jsonb_build_array(jsonb_build_object('id',p.id,'version',p.version+1,'revision_id',v));
 end loop;return output;end $$;
create or replace function public.cms_create_page(s uuid,r text,docs jsonb) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare l text;pid uuid;begin
 if cms_role(s) is null then raise exception 'FORBIDDEN';end if;
 if r !~ '^[a-z0-9]+(-[a-z0-9]+)*(/[a-z0-9]+(-[a-z0-9]+)*)*$' or length(r)>180 or r ~ '^(admin|api|media|_next|he|ar)(/|$)' then raise exception 'INVALID_ROUTE';end if;
 foreach l in array array['he','ar'] loop
  insert into cms_pages(site_id,route,locale,draft) values(s,r,l,docs->l) returning id into pid;
  insert into cms_revisions(site_id,page_id,version,document,created_by) values(s,pid,1,docs->l,auth.uid());
 end loop;insert into cms_audit(site_id,actor,event,subject) values(s,auth.uid(),'page_created',r);end $$;
create or replace function public.cms_refresh_media(s uuid) returns void language sql security definer set search_path=public,pg_temp as $$ update cms_media m set published=exists(select 1 from cms_pages p join cms_revisions r on r.id=p.published_revision where p.site_id=s and r.document::text like '%/media/'||m.id::text||'/%') where m.site_id=s $$;
create or replace function public.cms_publish(s uuid,pid uuid,revision uuid,expected_version int,remove boolean default false) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare p cms_pages;v cms_revisions;begin
 if cms_role(s)<>'admin' or cms_role(s) is null then raise exception 'FORBIDDEN';end if;
 select * into p from cms_pages where id=pid and site_id=s for update;if not found then raise exception 'NOT_FOUND';end if;
 if p.version<>expected_version then raise exception 'VERSION_CONFLICT';end if;
 if remove and p.route='@shell' then raise exception 'SHELL_REQUIRED';end if;
 if not remove then select * into v from cms_revisions where id=revision and page_id=pid and site_id=s and version=expected_version;if not found then raise exception 'VERSION_CONFLICT';end if;end if;
 update cms_pages set published_revision=case when remove then null else revision end,updated_at=now() where id=pid;
 perform cms_refresh_media(s);
 insert into cms_audit(site_id,actor,event,subject,details) values(s,auth.uid(),case when remove then 'unpublished' else 'published' end,pid::text,jsonb_build_object('revision',revision));end $$;
-- Internal worker functions are callable by the service role only.
create or replace function public.cms_reserve_cost(s uuid,p text,c numeric) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare budget numeric;enabled boolean;spent numeric;reservation uuid;begin
 if c<=0 then raise exception 'INVALID_COST';end if;
 select monthly_budget_usd,ai_enabled into budget,enabled from cms_sites where id=s for update;
 select coalesce(sum(coalesce(actual_usd,reserved_usd)),0) into spent from cms_usage where site_id=s and created_at>=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC';
 if not enabled or budget<=0 or spent+c>budget then raise exception 'BUDGET_EXCEEDED';end if;
 insert into cms_usage(site_id,provider,reserved_usd) values(s,p,c) returning id into reservation;return reservation;end $$;
create or replace function public.cms_claim_rate(s uuid,b text,maximum int) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare n int;begin insert into cms_rate_limits(site_id,bucket,window_start,count) values(s,b,date_trunc('minute',now()),1) on conflict(site_id,bucket,window_start) do update set count=cms_rate_limits.count+1 returning count into n;return n<=maximum;end $$;
revoke all on function public.cms_refresh_media(uuid),public.cms_reserve_cost(uuid,text,numeric),public.cms_claim_rate(uuid,text,int) from public,anon,authenticated;
grant execute on function public.cms_refresh_media(uuid),public.cms_reserve_cost(uuid,text,numeric),public.cms_claim_rate(uuid,text,int) to service_role;
revoke all on function public.cms_save_bundle(uuid,jsonb),public.cms_create_page(uuid,text,jsonb),public.cms_publish(uuid,uuid,uuid,int,boolean) from public,anon;
grant execute on function public.cms_save_bundle(uuid,jsonb),public.cms_create_page(uuid,text,jsonb),public.cms_publish(uuid,uuid,uuid,int,boolean) to authenticated;
grant execute on function public.cms_public_page(uuid,text,text),public.cms_public_index(uuid) to anon,authenticated;
revoke all on public.cms_sites,public.cms_memberships,public.cms_pages,public.cms_revisions,public.cms_media,public.cms_ai_tasks,public.cms_audit,public.cms_usage,public.cms_rate_limits from anon,authenticated;
grant select on public.cms_sites,public.cms_memberships,public.cms_pages,public.cms_revisions,public.cms_media,public.cms_ai_tasks,public.cms_audit,public.cms_usage to authenticated;
grant update(monthly_budget_usd,ai_enabled) on public.cms_sites to authenticated;
grant all on public.cms_sites,public.cms_memberships,public.cms_pages,public.cms_revisions,public.cms_media,public.cms_ai_tasks,public.cms_audit,public.cms_usage,public.cms_rate_limits to service_role;
grant usage,select on sequence public.cms_audit_id_seq to service_role;
revoke insert,update,delete on public.cms_pages,public.cms_revisions,public.cms_memberships,public.cms_media,public.cms_ai_tasks,public.cms_audit,public.cms_usage from anon,authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('cms-media','cms-media',false,209715200,array['image/jpeg','image/png','image/webp','video/mp4','video/webm']) on conflict(id) do nothing;
drop policy if exists cms_upload on storage.objects;create policy cms_upload on storage.objects for insert to authenticated with check(bucket_id='cms-media' and (storage.foldername(name))[2]=auth.uid()::text and public.cms_role(((storage.foldername(name))[1])::uuid) is not null);
drop policy if exists cms_media_read on storage.objects;create policy cms_media_read on storage.objects for select to authenticated using(bucket_id='cms-media' and public.cms_role(((storage.foldername(name))[1])::uuid) is not null);
-- No UPDATE/DELETE policy: immutable uploads cannot overwrite a reviewed asset.
create or replace function public.cms_set_member_role(s uuid,uid uuid,new_role text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare old_role text;n int;begin
 perform 1 from cms_sites where id=s for update;
 if cms_role(s)<>'admin' or cms_role(s) is null then raise exception 'FORBIDDEN';end if;
 if new_role not in('admin','editor','remove') then raise exception 'INVALID_ROLE';end if;
 select role into old_role from cms_memberships where site_id=s and user_id=uid;if not found then raise exception 'NOT_FOUND';end if;
 if old_role='admin' and new_role<>'admin' then select count(*) into n from cms_memberships where site_id=s and role='admin';if n<=1 then raise exception 'LAST_ADMIN';end if;end if;
 if new_role='remove' then delete from cms_memberships where site_id=s and user_id=uid;else update cms_memberships set role=new_role where site_id=s and user_id=uid;end if;
 insert into cms_audit(site_id,actor,event,subject) values(s,auth.uid(),'member_role_changed',uid::text);
end $$;
revoke all on function public.cms_set_member_role(uuid,uuid,text) from public,anon;
grant execute on function public.cms_set_member_role(uuid,uuid,text) to authenticated;
commit;
