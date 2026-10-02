create table public.palabra_groups (
  id uuid primary key default gen_random_uuid(), name text not null check(char_length(name) between 2 and 30),
  owner_id uuid not null references public.palabra_profiles(id), created_at timestamptz not null default now(), dissolved_at timestamptz
);
create table public.palabra_memberships (
  id uuid primary key default gen_random_uuid(), group_id uuid not null references public.palabra_groups(id) on delete cascade,
  profile_id uuid not null references public.palabra_profiles(id) on delete cascade,
  generation integer not null check(generation>0), joined_at timestamptz not null default now(), left_at timestamptz,
  unique(profile_id,generation)
);
create unique index palabra_one_group on public.palabra_memberships(profile_id) where left_at is null;
create index palabra_group_members on public.palabra_memberships(group_id) where left_at is null;
create table palabra_private.group_invites (
  group_id uuid primary key references public.palabra_groups(id) on delete cascade,
  code_hash text unique not null check(code_hash ~ '^[a-f0-9]{64}$'), expires_at timestamptz not null default now()+interval '7 days'
);
alter table public.palabra_groups enable row level security;
alter table public.palabra_memberships enable row level security;
alter table palabra_private.group_invites enable row level security;
revoke all on public.palabra_groups,public.palabra_memberships,palabra_private.group_invites from public,anon,authenticated;
create or replace function palabra_private.binding(profile uuid) returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('profileId',p.id,'groupId',m.group_id,'membershipId',m.id,'membershipGeneration',m.generation,
    'deviceGeneration',p.device_generation,'joinedAt',m.joined_at,'enabled',true)
  from public.palabra_memberships m join public.palabra_profiles p on p.id=m.profile_id
  join public.palabra_groups g on g.id=m.group_id where p.id=profile and m.left_at is null and g.dissolved_at is null
$$;
create function palabra_private.group_data(profile uuid) returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('group',jsonb_build_object('id',g.id,'name',g.name,'ownerId',g.owner_id),
    'binding',palabra_private.binding(profile), 'memberProfiles',(
      select jsonb_agg(jsonb_build_object('id',p.id,'nickname',p.nickname,'receiveNudges',p.receive_nudges,'joinedAt',m.joined_at) order by m.joined_at,m.id)
      from public.palabra_memberships m join public.palabra_profiles p on p.id=m.profile_id where m.group_id=g.id and m.left_at is null))
  from public.palabra_groups g join public.palabra_memberships own on own.group_id=g.id
  where own.profile_id=profile and own.left_at is null and g.dissolved_at is null
$$;
create function palabra_private.add_member(profile uuid,grp uuid) returns void language sql set search_path='' as $$
  insert into public.palabra_memberships(profile_id,group_id,generation)
    select profile,grp,coalesce(max(generation),0)+1 from public.palabra_memberships where profile_id=profile
$$;
create function palabra_private.invite(code text) returns jsonb language plpgsql set search_path='' as $$
declare grp uuid; normalized text:=lower(regexp_replace(code,'\s','','g'));
begin
  if palabra_private.failure_limited('invite:'||auth.uid()) then return palabra_private.fail('RATE_LIMITED'); end if;
  select i.group_id into grp from palabra_private.group_invites i join public.palabra_groups g on g.id=i.group_id
  where i.code_hash=palabra_private.digest(normalized) and normalized ~ '^[a-f0-9]{32}$' and i.expires_at>now() and g.dissolved_at is null;
  if grp is null then
    perform palabra_private.consume('invite:'||auth.uid(),date_trunc('hour',now()),5);
    return palabra_private.fail('INVITE_INVALID');
  end if;
  return palabra_private.ok(to_jsonb(grp));
end $$;
create function public.palabra_group() returns jsonb language plpgsql security definer set search_path='' as $$
declare err jsonb; actor uuid; data jsonb;
begin
  err:=palabra_private.guard(); if err is not null then return err; end if;
  actor:=palabra_private.current_profile(); if actor is null then return palabra_private.identity_error(); end if;
  data:=palabra_private.group_data(actor); if data is null then return palabra_private.fail('NOT_MEMBER'); end if;
  return palabra_private.ok(data);
end $$;
create function public.palabra_create_group(p_name text,p_invite_hash text,p_operation_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare err jsonb; actor uuid; grp uuid; params jsonb:=jsonb_build_array('create',p_name,p_invite_hash);
begin
  err:=palabra_private.guard(); if err is not null then return err; end if;
  actor:=palabra_private.current_profile(); if actor is null then return palabra_private.identity_error(); end if;
  err:=palabra_private.replay(p_operation_id,params); if err is not null then return err; end if;
  if not palabra_private.write_allowed() then return palabra_private.fail('RATE_LIMITED'); end if;
  if p_operation_id is null or p_name is null or char_length(btrim(p_name)) not between 2 and 30 or p_invite_hash is null or p_invite_hash !~ '^[a-f0-9]{64}$' then return palabra_private.fail('INVALID_INPUT'); end if;
  if palabra_private.binding(actor) is not null then return palabra_private.fail('ALREADY_MEMBER'); end if;
  if exists(select 1 from palabra_private.group_invites where code_hash=p_invite_hash) then return palabra_private.fail('INVALID_INPUT'); end if;
  if not palabra_private.consume('create:'||actor,date_trunc('day',now() at time zone 'Asia/Shanghai') at time zone 'Asia/Shanghai',3) then return palabra_private.fail('RATE_LIMITED'); end if;
  insert into public.palabra_groups(name,owner_id) values(btrim(p_name),actor) returning id into grp;
  perform palabra_private.add_member(actor,grp);
  insert into palabra_private.group_invites(group_id,code_hash) values(grp,p_invite_hash);
  return palabra_private.receipt(p_operation_id,params,palabra_private.ok(palabra_private.group_data(actor)));
end $$;
create function public.palabra_preview_invite(p_code text) returns jsonb language plpgsql security definer set search_path='' as $$
declare err jsonb; grp uuid;
begin
  err:=palabra_private.guard(); if err is not null then return err; end if;
  if palabra_private.current_profile() is null then return palabra_private.identity_error(); end if;
  err:=palabra_private.invite(p_code); if not (err->>'ok')::boolean then return err; end if;
  grp:=(err->>'data')::uuid;
  return palabra_private.ok(jsonb_build_object('name',(select name from public.palabra_groups where id=grp),
    'memberCount',(select count(*) from public.palabra_memberships where group_id=grp and left_at is null)));
end $$;
create function public.palabra_join_group(p_code text,p_operation_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare err jsonb; actor uuid; grp uuid; params jsonb:=jsonb_build_array('join',palabra_private.digest(coalesce(p_code,'')));
begin
  err:=palabra_private.guard(); if err is not null then return err; end if;
  actor:=palabra_private.current_profile(); if actor is null then return palabra_private.identity_error(); end if;
  err:=palabra_private.replay(p_operation_id,params); if err is not null then return err; end if;
  if p_operation_id is null then return palabra_private.fail('INVALID_INPUT'); end if;
  if not palabra_private.write_allowed() then return palabra_private.fail('RATE_LIMITED'); end if;
  if palabra_private.binding(actor) is not null then return palabra_private.fail('ALREADY_MEMBER'); end if;
  err:=palabra_private.invite(p_code); if not (err->>'ok')::boolean then return err; end if;
  grp:=(err->>'data')::uuid;
  perform 1 from public.palabra_groups where id=grp for update;
  if (select count(*) from public.palabra_memberships where group_id=grp and left_at is null)>=10 then return palabra_private.fail('GROUP_FULL'); end if;
  perform palabra_private.add_member(actor,grp);
  return palabra_private.receipt(p_operation_id,params,palabra_private.ok(palabra_private.group_data(actor)));
end $$;
create function public.palabra_manage_group(p_action text,p_target_profile_id uuid,p_name text,p_invite_hash text,p_operation_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare err jsonb; actor uuid; grp public.palabra_groups; member public.palabra_memberships;
  params jsonb:=jsonb_build_array('manage',p_action,p_target_profile_id,p_name,p_invite_hash);
begin
  err:=palabra_private.guard(); if err is not null then return err; end if;
  actor:=palabra_private.current_profile(); if actor is null then return palabra_private.identity_error(); end if;
  err:=palabra_private.replay(p_operation_id,params); if err is not null then return err; end if;
  if p_operation_id is null or p_action is null or p_action not in ('rename','rotate_invite','remove','transfer','leave','dissolve') then return palabra_private.fail('INVALID_INPUT'); end if;
  if not palabra_private.write_allowed() then return palabra_private.fail('RATE_LIMITED'); end if;
  select * into member from public.palabra_memberships where profile_id=actor and left_at is null;
  if not found then return palabra_private.fail('NOT_MEMBER'); end if;
  select * into grp from public.palabra_groups where id=member.group_id and dissolved_at is null for update;
  if not found then return palabra_private.fail('NOT_MEMBER'); end if;
  if p_action='leave' then
    if grp.owner_id=actor then return palabra_private.fail('OWNER_REQUIRED'); end if;
    update public.palabra_memberships set left_at=now() where id=member.id;
  else
    if grp.owner_id<>actor then return palabra_private.fail('FORBIDDEN'); end if;
    case p_action
    when 'rename' then
      if p_name is null or char_length(btrim(p_name)) not between 2 and 30 then return palabra_private.fail('INVALID_INPUT'); end if;
      update public.palabra_groups set name=btrim(p_name) where id=grp.id;
    when 'rotate_invite' then
      if p_invite_hash is null or p_invite_hash !~ '^[a-f0-9]{64}$' or exists(select 1 from palabra_private.group_invites where code_hash=p_invite_hash) then return palabra_private.fail('INVALID_INPUT'); end if;
      insert into palabra_private.group_invites(group_id,code_hash) values(grp.id,p_invite_hash)
      on conflict(group_id) do update set code_hash=excluded.code_hash,expires_at=now()+interval '7 days';
    when 'remove','transfer' then
      if p_target_profile_id is null or p_target_profile_id=actor or not exists(select 1 from public.palabra_memberships where profile_id=p_target_profile_id and group_id=grp.id and left_at is null) then return palabra_private.fail('INVALID_TARGET'); end if;
      if p_action='remove' then update public.palabra_memberships set left_at=now() where profile_id=p_target_profile_id and left_at is null;
      else update public.palabra_groups set owner_id=p_target_profile_id where id=grp.id; end if;
    when 'dissolve' then
      update public.palabra_groups set dissolved_at=now() where id=grp.id;
      update public.palabra_memberships set left_at=now() where group_id=grp.id and left_at is null;
      delete from palabra_private.group_invites where group_id=grp.id;
    end case;
  end if;
  return palabra_private.receipt(p_operation_id,params,palabra_private.ok(palabra_private.group_data(actor)));
end $$;
revoke all on all functions in schema palabra_private from public,anon,authenticated;
do $$declare f record; begin
  for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname like 'palabra\_%' escape '\' loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
    execute format('grant execute on function %s to authenticated',f.signature);
  end loop;
end $$;
