create extension if not exists pg_net with schema extensions;

create table moh16_private.web_push_devices (
  endpoint text primary key,
  church_id uuid not null references public.moh16_churches(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  p256dh text not null,
  auth_key text not null
);
create index web_push_devices_owner on moh16_private.web_push_devices(church_id, user_id);
alter table moh16_private.web_push_devices enable row level security;

create table moh16_private.web_push_queue (
  id bigint generated always as identity primary key,
  endpoint text not null references moh16_private.web_push_devices(endpoint) on delete cascade,
  church_id uuid not null,
  user_id uuid not null,
  notification_id uuid not null,
  created_at timestamptz not null default now(),
  ready_at timestamptz not null default now(),
  attempts integer not null default 0,
  unique (endpoint, church_id, user_id, notification_id)
);
create index web_push_queue_ready on moh16_private.web_push_queue(ready_at);
alter table moh16_private.web_push_queue enable row level security;

create function moh16_private.save_web_push(c uuid, e text, p text, a text)
returns void language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  if p is null and a is null then
    delete from moh16_private.web_push_devices where endpoint=e and church_id=c and user_id=u;
    return;
  end if;
  if not moh16_private.has_membership(c) then
    raise exception 'Active membership required' using errcode = '42501';
  end if;
  if length(e) not between 25 and 2048 or e !~ '^https://(fcm\.googleapis\.com|([a-z0-9-]+\.)*push\.apple\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.notify\.windows\.com)/[^[:space:]#]+$'
     or coalesce(p,'') !~ '^[A-Za-z0-9_-]{87}$' or coalesce(a,'') !~ '^[A-Za-z0-9_-]{22}$' then
    raise exception 'Unsupported browser push subscription' using errcode = '22023';
  end if;
  insert into moh16_private.web_push_devices(endpoint,church_id,user_id,p256dh,auth_key)
  values(e,c,u,p,a)
  on conflict (endpoint) do update set p256dh=excluded.p256dh,auth_key=excluded.auth_key
  where web_push_devices.church_id=c and web_push_devices.user_id=u;
  if not found then raise exception 'Re-enable notifications on this device'; end if;
end;
$$;
create function public.moh16_save_web_push(p_church uuid,p_endpoint text,p_p256dh text,p_auth text)
returns void language sql set search_path = '' as $$
  select moh16_private.save_web_push(p_church,p_endpoint,p_p256dh,p_auth)
$$;
revoke all on function moh16_private.save_web_push(uuid,text,text,text) from public,anon;
revoke all on function public.moh16_save_web_push(uuid,text,text,text) from public,anon;
grant execute on function moh16_private.save_web_push(uuid,text,text,text),
  public.moh16_save_web_push(uuid,text,text,text) to authenticated;

create function moh16_private.enqueue_web_push()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into moh16_private.web_push_queue(endpoint, church_id, user_id, notification_id)
  select endpoint,new.church_id,new.user_id,new.id from moh16_private.web_push_devices
  where church_id=new.church_id and user_id=new.user_id
  on conflict do nothing;
  return new;
end;
$$;
revoke all on function moh16_private.enqueue_web_push() from public,anon,authenticated;
create trigger moh16_web_push_enqueue after insert on public.moh16_notifications
for each row execute function moh16_private.enqueue_web_push();

create function moh16_private.announcement_into_inbox()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.moh16_notifications(church_id,user_id,kind,title,body,dedupe_key)
  select new.church_id,new.user_id,'announcement',a.title,a.body,'announcement:'||new.announcement_id
  from public.moh16_announcements a
  where a.church_id=new.church_id and a.id=new.announcement_id
  on conflict(church_id,user_id,dedupe_key) do nothing;
  return new;
end;
$$;
revoke all on function moh16_private.announcement_into_inbox() from public,anon,authenticated;
create trigger moh16_announcement_inbox after insert on public.moh16_announcement_recipients
for each row execute function moh16_private.announcement_into_inbox();

create function moh16_private.claim_web_push(token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare cfg jsonb;
begin
  select decrypted_secret::jsonb into cfg from vault.decrypted_secrets where name='crc_moh_web_push';
  if token is null or cfg is null or cfg->>'token' is distinct from token then
    raise exception 'Unauthorized sender' using errcode='42501';
  end if;
  delete from moh16_private.web_push_queue
  where created_at < now() - interval '1 day' or (attempts >= 6 and ready_at <= now());
  return jsonb_build_object('public_key',cfg->>'public_key','private_key',cfg->>'private_key','jobs',
    coalesce((
      with candidates as (
        select q.id from moh16_private.web_push_queue q
        join public.moh16_memberships m on m.church_id=q.church_id and m.user_id=q.user_id and m.active
        join public.moh16_churches c on c.id=q.church_id and c.status <> 'suspended'
        where q.ready_at <= now() and q.attempts < 6
        order by q.id limit 30 for update of q skip locked
      ), claimed as (
        update moh16_private.web_push_queue q
        set attempts=q.attempts+1, ready_at=now()+interval '1 minute' * (1 + q.attempts * q.attempts)
        from candidates where q.id=candidates.id
        returning q.id,q.endpoint,q.notification_id,q.attempts
      )
      select jsonb_agg(to_jsonb(c)||jsonb_build_object('p256dh',d.p256dh,'auth',d.auth_key))
      from claimed c join moh16_private.web_push_devices d using(endpoint)
    ),'[]'::jsonb));
end;
$$;
create function public.moh16_claim_web_push(p_token text)
returns jsonb language sql set search_path = '' as $$
  select moh16_private.claim_web_push(p_token)
$$;

create function moh16_private.finish_web_push(job bigint, lease integer, expired boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare e text;
begin
  delete from moh16_private.web_push_queue where id=job and attempts=lease returning endpoint into e;
  if expired and e is not null then
    delete from moh16_private.web_push_devices where endpoint=e;
  end if;
end;
$$;
create function public.moh16_finish_web_push(p_id bigint,p_attempt integer,p_expired boolean)
returns void language sql set search_path = '' as $$
  select moh16_private.finish_web_push(p_id,p_attempt,p_expired)
$$;
revoke all on function moh16_private.claim_web_push(text),public.moh16_claim_web_push(text),
  moh16_private.finish_web_push(bigint,integer,boolean),public.moh16_finish_web_push(bigint,integer,boolean)
  from public,anon,authenticated;
grant usage on schema moh16_private to service_role;
grant execute on function moh16_private.claim_web_push(text),public.moh16_claim_web_push(text),
  moh16_private.finish_web_push(bigint,integer,boolean),public.moh16_finish_web_push(bigint,integer,boolean)
  to service_role;

create function public.moh16_submit_sunday_availability(p_church uuid,p_date date,p_votes jsonb)
returns void language plpgsql set search_path = '' as $$
declare vote jsonb;
begin
  if jsonb_typeof(p_votes) is distinct from 'array' then raise exception 'Choose your availability'; end if;
  if jsonb_array_length(p_votes) not between 1 and 2 then raise exception 'Choose your availability'; end if;
  for vote in select value from jsonb_array_elements(p_votes) loop
    perform public.moh16_submit_availability(p_church,vote->>'service',p_date,vote->>'choice',vote->>'reason');
  end loop;
end;
$$;
revoke all on function public.moh16_submit_sunday_availability(uuid,date,jsonb) from public,anon;
grant execute on function public.moh16_submit_sunday_availability(uuid,date,jsonb) to authenticated;

alter publication supabase_realtime add table public.moh16_notifications;

create function moh16_private.dispatch_web_push()
returns void language plpgsql security definer set search_path = '' as $$
declare cfg jsonb;
begin
  if not exists(select 1 from moh16_private.web_push_queue where ready_at <= now()) then return; end if;
  select decrypted_secret::jsonb into cfg from vault.decrypted_secrets where name='crc_moh_web_push';
  if cfg is null then return; end if;
  perform net.http_post(
    url := cfg->>'function_url',
    headers := jsonb_build_object('content-type','application/json','x-moh-push-token',cfg->>'token'),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
end;
$$;
revoke all on function moh16_private.dispatch_web_push() from public,anon,authenticated;
select cron.schedule('crc-moh-web-push', '* * * * *', 'select moh16_private.dispatch_web_push()');
