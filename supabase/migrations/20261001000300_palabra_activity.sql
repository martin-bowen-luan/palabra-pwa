create table palabra_private.device_summaries (
  membership_id uuid not null references public.palabra_memberships(id) on delete cascade,
  date date not null, language text not null check(language in ('en','es')), device_generation integer not null check(device_generation>0),
  version integer not null check(version>0), payload jsonb not null,
  primary key(membership_id,date,language,device_generation)
);
create table public.palabra_daily_summaries (
  membership_id uuid not null references public.palabra_memberships(id) on delete cascade,
  date date not null, language text not null check(language in ('en','es')), goal integer not null check(goal>0),
  new_count integer not null check(new_count between 0 and 100000), review_count integer not null check(review_count between 0 and 100000),
  skipped_count integer not null check(skipped_count between 0 and 100000), conservative boolean not null,
  last_practiced_at timestamptz not null, synced_at timestamptz not null default now(),
  primary key(membership_id,date,language)
);
create table public.palabra_daily_notes (
  membership_id uuid not null references public.palabra_memberships(id) on delete cascade,
  date date not null, device_generation integer not null check(device_generation>0), version integer not null check(version>0),
  text text not null check(char_length(text)<=100), synced_at timestamptz not null default now(),
  primary key(membership_id,date)
);
create table public.palabra_nudges (
  id uuid primary key default gen_random_uuid(), group_id uuid not null references public.palabra_groups(id) on delete cascade,
  sender_id uuid not null references public.palabra_profiles(id) on delete cascade,
  receiver_id uuid not null references public.palabra_profiles(id) on delete cascade,
  sender_membership uuid not null references public.palabra_memberships(id) on delete cascade,
  receiver_membership uuid not null references public.palabra_memberships(id) on delete cascade,
  date date not null default (now() at time zone 'Asia/Shanghai')::date, kind text not null check(kind in ('cheer','remind')),
  created_at timestamptz not null default now(), read_at timestamptz,
  unique(sender_id,receiver_id,group_id,date,kind), check(sender_id<>receiver_id)
);
alter table palabra_private.device_summaries enable row level security;
alter table public.palabra_daily_summaries enable row level security;
alter table public.palabra_daily_notes enable row level security;
alter table public.palabra_nudges enable row level security;
revoke all on palabra_private.device_summaries,public.palabra_daily_summaries,public.palabra_daily_notes,public.palabra_nudges from public,anon,authenticated;
create function palabra_private.valid_date(day date,joined timestamptz) returns boolean language sql stable set search_path='' as $$
 select day between greatest((now() at time zone 'Asia/Shanghai')::date-29,(joined at time zone 'Asia/Shanghai')::date) and (now() at time zone 'Asia/Shanghai')::date
$$;
create function palabra_private.match_binding(member uuid,generation integer,device integer) returns boolean language sql stable set search_path='' as $$
 select exists(select 1 from public.palabra_memberships m join public.palabra_profiles p on p.id=m.profile_id
   where m.id=member and m.generation=generation and m.left_at is null and p.device_generation=device and p.id=palabra_private.current_profile())
$$;
create function public.palabra_sync_summary(p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare err jsonb; member uuid; day date; lang text; gen integer; device integer; ver integer; goal_value integer;
  prior palabra_private.device_summaries; joined timestamptz; practiced timestamptz; key text; aggregate public.palabra_daily_summaries;
begin
  err:=palabra_private.guard(); if err is not null then return err; end if;
  if palabra_private.current_profile() is null then return palabra_private.identity_error(); end if;
  if not palabra_private.write_allowed() then return palabra_private.fail('RATE_LIMITED'); end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' or length(p_payload::text)>4000 then return palabra_private.fail('INVALID_PAYLOAD'); end if;
  if p_payload-array['membershipId','membershipGeneration','deviceGeneration','date','language','version','goal','newCount','reviewCount','skippedCount','lastPracticedAt']<>'{}'::jsonb
    or (select count(*) from jsonb_object_keys(p_payload))<>11 then return palabra_private.fail('INVALID_PAYLOAD'); end if;
  foreach key in array array['membershipGeneration','deviceGeneration','version','goal','newCount','reviewCount','skippedCount'] loop
    if jsonb_typeof(p_payload->key)<>'number' or (p_payload->>key) !~ '^[0-9]{1,9}$' then return palabra_private.fail('INVALID_PAYLOAD'); end if;
  end loop;
  begin
    member:=(p_payload->>'membershipId')::uuid; day:=(p_payload->>'date')::date; practiced:=(p_payload->>'lastPracticedAt')::timestamptz;
  exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then return palabra_private.fail('INVALID_PAYLOAD'); end;
  gen:=(p_payload->>'membershipGeneration')::integer; device:=(p_payload->>'deviceGeneration')::integer;
  ver:=(p_payload->>'version')::integer; goal_value:=(p_payload->>'goal')::integer; lang:=p_payload->>'language';
  if member is null or day is null or practiced is null or lang is null or lang not in ('en','es') or ver<=0 or gen<=0 or device<=0
    or (lang='en' and goal_value not in (5,10,15,20)) or (lang='es' and goal_value not in (10,20,30,50))
    or (p_payload->>'newCount')::integer>100000 or (p_payload->>'reviewCount')::integer>100000 or (p_payload->>'skippedCount')::integer>100000
    or (p_payload->>'skippedCount')::integer>(p_payload->>'newCount')::integer+(p_payload->>'reviewCount')::integer
    then return palabra_private.fail('INVALID_PAYLOAD'); end if;
  if not palabra_private.match_binding(member,gen,device) then return palabra_private.fail('STALE_BINDING'); end if;
  select joined_at into joined from public.palabra_memberships where id=member;
  if not palabra_private.valid_date(day,joined) or practiced<joined or (practiced at time zone 'Asia/Shanghai')::date<>day or practiced>now()+interval '5 minutes' then return palabra_private.fail('DATE_OUT_OF_RANGE'); end if;
  select * into prior from palabra_private.device_summaries where membership_id=member and date=day and language=lang and device_generation=device;
  if found and ver=prior.version and p_payload<>prior.payload then return palabra_private.fail('VERSION_CONFLICT'); end if;
  if not found or ver>prior.version then
    insert into palabra_private.device_summaries values(member,day,lang,device,ver,p_payload)
    on conflict(membership_id,date,language,device_generation) do update set version=excluded.version,payload=excluded.payload;
    insert into public.palabra_daily_summaries as s
      select member,day,lang,goal_value,max((payload->>'newCount')::integer),max((payload->>'reviewCount')::integer),
        least(max((payload->>'skippedCount')::integer),max((payload->>'newCount')::integer)+max((payload->>'reviewCount')::integer)),
        count(*)>1,max((payload->>'lastPracticedAt')::timestamptz),now()
      from palabra_private.device_summaries where membership_id=member and date=day and language=lang
    on conflict(membership_id,date,language) do update set new_count=excluded.new_count,review_count=excluded.review_count,
      skipped_count=excluded.skipped_count,conservative=excluded.conservative,last_practiced_at=excluded.last_practiced_at,synced_at=now();
  end if;
  select * into aggregate from public.palabra_daily_summaries where membership_id=member and date=day and language=lang;
  return palabra_private.ok(jsonb_build_object('acceptedVersion',greatest(ver,coalesce(prior.version,0)),'deviceGeneration',device,'conservative',aggregate.conservative));
end $$;
create function public.palabra_publish_note(p_membership_id uuid,p_membership_generation integer,p_device_generation integer,p_date date,p_version integer,p_text text) returns jsonb language plpgsql security definer set search_path='' as $$
declare err jsonb; prior public.palabra_daily_notes; joined timestamptz;
begin
  err:=palabra_private.guard(); if err is not null then return err; end if;
  if palabra_private.current_profile() is null then return palabra_private.identity_error(); end if;
  if not palabra_private.write_allowed() then return palabra_private.fail('RATE_LIMITED'); end if;
  if p_text is null or char_length(p_text)>100 or p_version is null or p_version<1 or p_date is null then return palabra_private.fail('INVALID_INPUT'); end if;
  if not palabra_private.match_binding(p_membership_id,p_membership_generation,p_device_generation) then return palabra_private.fail('STALE_BINDING'); end if;
  select joined_at into joined from public.palabra_memberships where id=p_membership_id;
  if not palabra_private.valid_date(p_date,joined) then return palabra_private.fail('DATE_OUT_OF_RANGE'); end if;
  select * into prior from public.palabra_daily_notes where membership_id=p_membership_id and date=p_date;
  if found and prior.device_generation=p_device_generation then
    if prior.version=p_version and prior.text<>p_text then return palabra_private.fail('VERSION_CONFLICT'); end if;
    if prior.version>=p_version then return palabra_private.ok(jsonb_build_object('acceptedVersion',prior.version)); end if;
  end if;
  insert into public.palabra_daily_notes values(p_membership_id,p_date,p_device_generation,p_version,p_text,now())
  on conflict(membership_id,date) do update set device_generation=excluded.device_generation,version=excluded.version,text=excluded.text,synced_at=now();
  return palabra_private.ok(jsonb_build_object('acceptedVersion',p_version));
end $$;
create function public.palabra_activity(p_from_date date) returns jsonb language plpgsql security definer set search_path='' as $$
declare err jsonb; actor uuid; own public.palabra_memberships; since date; today date:=(now() at time zone 'Asia/Shanghai')::date; summaries jsonb; notes jsonb; nudges jsonb;
begin
  err:=palabra_private.guard(); if err is not null then return err; end if;
  actor:=palabra_private.current_profile(); if actor is null then return palabra_private.identity_error(); end if;
  select * into own from public.palabra_memberships where profile_id=actor and left_at is null;
  if not found then return palabra_private.fail('NOT_MEMBER'); end if;
  since:=greatest(coalesce(p_from_date,today-29),today-29,(own.joined_at at time zone 'Asia/Shanghai')::date);
  select jsonb_agg(jsonb_build_object('profileId',m.profile_id,'date',s.date,'language',s.language,'goal',s.goal,'newCount',s.new_count,
    'reviewCount',s.review_count,'skippedCount',s.skipped_count,'conservative',s.conservative,'lastPracticedAt',s.last_practiced_at,'syncedAt',s.synced_at) order by s.date desc,s.language)
    into summaries from public.palabra_daily_summaries s join public.palabra_memberships m on m.id=s.membership_id
    where m.group_id=own.group_id and m.left_at is null and s.date between since and today;
  select jsonb_agg(jsonb_build_object('profileId',m.profile_id,'date',n.date,'text',n.text,'version',n.version,'deviceGeneration',n.device_generation,'syncedAt',n.synced_at) order by n.date desc)
    into notes from public.palabra_daily_notes n join public.palabra_memberships m on m.id=n.membership_id
    where m.group_id=own.group_id and m.left_at is null and n.date between since and today;
  select jsonb_agg(jsonb_build_object('id',n.id,'senderId',n.sender_id,'receiverId',n.receiver_id,'kind',n.kind,'date',n.date,'createdAt',n.created_at,'readAt',n.read_at) order by n.created_at desc)
    into nudges from public.palabra_nudges n join public.palabra_memberships a on a.id=n.sender_membership
      join public.palabra_memberships b on b.id=n.receiver_membership
    where n.group_id=own.group_id and (n.sender_id=actor or n.receiver_id=actor) and a.left_at is null and b.left_at is null and n.date between since and today;
  return palabra_private.ok(jsonb_build_object('summaries',coalesce(summaries,'[]'),'notes',coalesce(notes,'[]'),'nudges',coalesce(nudges,'[]'),'serverTime',now()));
end $$;
create function public.palabra_send_nudge(p_target_profile_id uuid,p_kind text,p_operation_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare err jsonb; actor uuid; own public.palabra_memberships; target public.palabra_memberships; nudge public.palabra_nudges;
  params jsonb:=jsonb_build_array('nudge',p_target_profile_id,p_kind);
begin
  err:=palabra_private.guard(); if err is not null then return err; end if;
  actor:=palabra_private.current_profile(); if actor is null then return palabra_private.identity_error(); end if;
  err:=palabra_private.replay(p_operation_id,params); if err is not null then return err; end if;
  if not palabra_private.write_allowed() then return palabra_private.fail('RATE_LIMITED'); end if;
  if p_operation_id is null or p_kind is null or p_kind not in ('cheer','remind') then return palabra_private.fail('INVALID_INPUT'); end if;
  select * into own from public.palabra_memberships where profile_id=actor and left_at is null;
  if not found then return palabra_private.fail('NOT_MEMBER'); end if;
  select * into target from public.palabra_memberships where profile_id=p_target_profile_id and group_id=own.group_id and left_at is null;
  if not found or p_target_profile_id=actor then return palabra_private.fail('INVALID_TARGET'); end if;
  if not (select receive_nudges from public.palabra_profiles where id=p_target_profile_id) then return palabra_private.fail('NUDGES_DISABLED'); end if;
  insert into public.palabra_nudges(group_id,sender_id,receiver_id,sender_membership,receiver_membership,kind)
  values(own.group_id,actor,p_target_profile_id,own.id,target.id,p_kind) on conflict do nothing returning * into nudge;
  if not found then return palabra_private.fail('ALREADY_SENT'); end if;
  return palabra_private.receipt(p_operation_id,params,palabra_private.ok(jsonb_build_object('id',nudge.id,'createdAt',nudge.created_at)));
end $$;
create function public.palabra_read_nudge(p_nudge_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare err jsonb; actor uuid; result jsonb;
begin
  err:=palabra_private.guard(); if err is not null then return err; end if;
  actor:=palabra_private.current_profile(); if actor is null then return palabra_private.identity_error(); end if;
  if not palabra_private.write_allowed() then return palabra_private.fail('RATE_LIMITED'); end if;
  update public.palabra_nudges n set read_at=coalesce(n.read_at,now())
    where n.id=p_nudge_id and n.receiver_id=actor and n.date>=(now() at time zone 'Asia/Shanghai')::date-29
      and exists(select 1 from public.palabra_memberships where id=n.sender_membership and left_at is null)
      and exists(select 1 from public.palabra_memberships where id=n.receiver_membership and left_at is null)
    returning jsonb_build_object('id',n.id,'readAt',n.read_at) into result;
  return case when result is null then palabra_private.fail('NOT_FOUND') else palabra_private.ok(result) end;
end $$;
create function public.palabra_delete_profile(p_operation_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare err jsonb; actor uuid; params jsonb:=jsonb_build_array('delete');
begin
  err:=palabra_private.guard(); if err is not null then return err; end if;
  err:=palabra_private.replay(p_operation_id,params); if err is not null then return err; end if;
  actor:=palabra_private.current_profile(); if actor is null then return palabra_private.identity_error(); end if;
  if p_operation_id is null then return palabra_private.fail('INVALID_INPUT'); end if;
  if not palabra_private.write_allowed() then return palabra_private.fail('RATE_LIMITED'); end if;
  if exists(select 1 from public.palabra_groups where owner_id=actor and dissolved_at is null) then return palabra_private.fail('OWNER_REQUIRED'); end if;
  delete from palabra_private.operation_receipts where auth_uid in (select auth_uid from palabra_private.device_bindings where profile_id=actor);
  delete from public.palabra_groups where owner_id=actor and dissolved_at is not null;
  delete from public.palabra_profiles where id=actor;
  return palabra_private.receipt(p_operation_id,params,palabra_private.ok(jsonb_build_object('deleted',true)));
end $$;
-- Scheduling is deliberately separate: enable production cron only after explicit approval.
create function palabra_private.cleanup() returns void language plpgsql set search_path='' as $$
declare cutoff date:=(now() at time zone 'Asia/Shanghai')::date-29;
begin
  perform pg_advisory_xact_lock(728314929105);
  delete from palabra_private.group_invites where expires_at<now();
  delete from palabra_private.device_summaries where date<cutoff;
  delete from public.palabra_daily_summaries where date<cutoff;
  delete from public.palabra_daily_notes where date<cutoff;
  delete from public.palabra_nudges where date<cutoff;
  delete from palabra_private.operation_receipts where created_at<now()-interval '30 days';
  delete from palabra_private.rate_limits where bucket<now()-interval '2 days';
end $$;
revoke all on all functions in schema palabra_private from public,anon,authenticated;
do $$declare f record; begin
  for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname like 'palabra\_%' escape '\' loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
    execute format('grant execute on function %s to authenticated',f.signature);
  end loop;
end $$;
