-- Private application identities. This migration does not enable hosted anonymous auth.
create schema palabra_private;
revoke all on schema palabra_private from public, anon, authenticated;

create table public.palabra_profiles (
  id uuid primary key default gen_random_uuid(),
  nickname text not null check (char_length(nickname) between 1 and 20),
  receive_nudges boolean not null default true,
  device_generation integer not null default 1 check (device_generation>0),
  created_at timestamptz not null default now()
);
create table palabra_private.device_bindings (
  auth_uid uuid primary key references auth.users(id) on delete cascade,
  profile_id uuid not null references public.palabra_profiles(id) on delete cascade,
  active boolean not null default true
);
create unique index palabra_one_device on palabra_private.device_bindings(profile_id) where active;
create table palabra_private.recovery_credentials (
  profile_id uuid primary key references public.palabra_profiles(id) on delete cascade,
  code_hash text not null unique check (code_hash ~ '^[a-f0-9]{64}$')
);
create table palabra_private.operation_receipts (
  auth_uid uuid not null references auth.users(id) on delete cascade,
  operation_id uuid not null,
  fingerprint text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key(auth_uid,operation_id)
);
create table palabra_private.rate_limits (
  key text primary key, bucket timestamptz not null, count integer not null check(count>=0)
);
create table palabra_private.feature_settings (
  id boolean primary key default true check(id), enabled boolean not null default false,
  identity_per_minute integer not null default 100 check(identity_per_minute between 1 and 1000)
);
insert into palabra_private.feature_settings default values;
alter table public.palabra_profiles enable row level security;
alter table palabra_private.device_bindings enable row level security;
alter table palabra_private.recovery_credentials enable row level security;
alter table palabra_private.operation_receipts enable row level security;
alter table palabra_private.rate_limits enable row level security;
alter table palabra_private.feature_settings enable row level security;
revoke all on public.palabra_profiles from public,anon,authenticated;
revoke all on all tables in schema palabra_private from public,anon,authenticated;

create function palabra_private.fail(code text) returns jsonb language sql immutable set search_path='' as $$
  select jsonb_build_object('ok',false,'code',code)
$$;
create function palabra_private.ok(data jsonb) returns jsonb language sql immutable set search_path='' as $$
  select jsonb_build_object('ok',true,'data',data)
$$;
create function palabra_private.digest(value text) returns text language sql immutable set search_path='' as $$
  select encode(sha256(convert_to(value,'UTF8')),'hex')
$$;
-- Deliberately serialize this small private-group subsystem, including reads. Recovery,
-- membership changes and uploads share one lock, never an authorization TOCTOU window.
-- This lock has no effect on vocabulary storage or unrelated project tables.
create function palabra_private.guard() returns jsonb language plpgsql set search_path='' as $$
begin
  if auth.uid() is null then return palabra_private.fail('AUTH_REQUIRED'); end if;
  perform pg_advisory_xact_lock(728314929105);
  if not (select enabled from palabra_private.feature_settings where id) then
    return palabra_private.fail('DISABLED');
  end if;
  return null;
end $$;
create function palabra_private.current_profile() returns uuid language sql stable set search_path='' as $$
  select profile_id from palabra_private.device_bindings where auth_uid=auth.uid() and active
$$;
create function palabra_private.identity_error() returns jsonb language sql stable set search_path='' as $$
  select palabra_private.fail(case when exists(select 1 from palabra_private.device_bindings where auth_uid=auth.uid()) then 'DEVICE_REPLACED' else 'NOT_REGISTERED' end)
$$;
create function palabra_private.consume(p_key text,p_bucket timestamptz,maximum integer) returns boolean language plpgsql set search_path='' as $$
declare n integer;
begin
  insert into palabra_private.rate_limits as r values(p_key,p_bucket,1)
  on conflict(key) do update set bucket=excluded.bucket,
    count=case when r.bucket=excluded.bucket then r.count+1 else 1 end returning count into n;
  return n<=maximum;
end $$;
create function palabra_private.failure_limited(key text) returns boolean language sql stable set search_path='' as $$
  select coalesce((select count>=5 from palabra_private.rate_limits where rate_limits.key=failure_limited.key and bucket=date_trunc('hour',now())),false)
$$;
create function palabra_private.write_allowed() returns boolean language sql set search_path='' as $$
  select palabra_private.consume('write:'||auth.uid(),date_trunc('minute',now()),30)
$$;
create function palabra_private.identity_allowed() returns boolean language sql set search_path='' as $$
  select palabra_private.consume('identity',date_trunc('minute',now()),(select identity_per_minute from palabra_private.feature_settings where id))
$$;
create function palabra_private.replay(op uuid,params jsonb) returns jsonb language plpgsql set search_path='' as $$
declare receipt palabra_private.operation_receipts;
begin
  select * into receipt from palabra_private.operation_receipts where auth_uid=auth.uid() and operation_id=op and created_at>=now()-interval '30 days';
  if found then
    if receipt.fingerprint<>palabra_private.digest(params::text) then return palabra_private.fail('OPERATION_CONFLICT'); end if;
    return receipt.result;
  end if;
  return null;
end $$;
create function palabra_private.receipt(op uuid,params jsonb,result jsonb) returns jsonb language plpgsql set search_path='' as $$
begin
  delete from palabra_private.operation_receipts where auth_uid=auth.uid() and operation_id=op and created_at<now()-interval '30 days';
  insert into palabra_private.operation_receipts(auth_uid,operation_id,fingerprint,result)
  values(auth.uid(),op,palabra_private.digest(params::text),result);
  return result;
end $$;
create function palabra_private.binding(profile uuid) returns jsonb language sql stable set search_path='' as $$select null::jsonb$$;
create function palabra_private.self_data(profile uuid) returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('profileId',p.id,'nickname',p.nickname,'deviceGeneration',p.device_generation,
    'receiveNudges',p.receive_nudges,'binding',palabra_private.binding(p.id))
  from public.palabra_profiles p where p.id=profile
$$;

create function public.palabra_self() returns jsonb language plpgsql security definer set search_path='' as $$
declare err jsonb; actor uuid;
begin
  err:=palabra_private.guard(); if err is not null then return err; end if;
  actor:=palabra_private.current_profile(); if actor is null then return palabra_private.identity_error(); end if;
  return palabra_private.ok(palabra_private.self_data(actor));
end $$;
create function public.palabra_operation(p_operation_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare err jsonb; result jsonb;
begin
  err:=palabra_private.guard(); if err is not null then return err; end if;
  if exists(select 1 from palabra_private.device_bindings where auth_uid=auth.uid() and not active) then return palabra_private.fail('NOT_FOUND'); end if;
  select r.result into result from palabra_private.operation_receipts r where auth_uid=auth.uid() and operation_id=p_operation_id and created_at>=now()-interval '30 days';
  return coalesce(result,palabra_private.fail('NOT_FOUND'));
end $$;
create function public.palabra_register(p_nickname text,p_recovery_hash text,p_operation_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare err jsonb; actor uuid; params jsonb:=jsonb_build_array('register',p_nickname,p_recovery_hash);
begin
  err:=palabra_private.guard(); if err is not null then return err; end if;
  if exists(select 1 from palabra_private.device_bindings where auth_uid=auth.uid() and not active) then return palabra_private.identity_error(); end if;
  err:=palabra_private.replay(p_operation_id,params); if err is not null then return err; end if;
  if not palabra_private.identity_allowed() then return palabra_private.fail('BUSY'); end if;
  if p_operation_id is null or p_nickname is null or char_length(btrim(p_nickname)) not between 1 and 20 or p_recovery_hash is null or p_recovery_hash !~ '^[a-f0-9]{64}$' then return palabra_private.fail('INVALID_INPUT'); end if;
  if palabra_private.current_profile() is not null then return palabra_private.fail('ALREADY_REGISTERED'); end if;
  if exists(select 1 from palabra_private.recovery_credentials where code_hash=p_recovery_hash) then return palabra_private.fail('INVALID_INPUT'); end if;
  insert into public.palabra_profiles(nickname) values(btrim(p_nickname)) returning id into actor;
  insert into palabra_private.device_bindings values(auth.uid(),actor,true);
  insert into palabra_private.recovery_credentials values(actor,p_recovery_hash);
  return palabra_private.receipt(p_operation_id,params,palabra_private.ok(palabra_private.self_data(actor)));
end $$;
create function public.palabra_recover(p_code text,p_next_hash text,p_operation_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare err jsonb; actor uuid; normalized text:=lower(regexp_replace(p_code,'\s','','g'));
  params jsonb:=jsonb_build_array('recover',palabra_private.digest(coalesce(p_code,'')),p_next_hash);
begin
  err:=palabra_private.guard(); if err is not null then return err; end if;
  if exists(select 1 from palabra_private.device_bindings where auth_uid=auth.uid() and not active) then return palabra_private.identity_error(); end if;
  err:=palabra_private.replay(p_operation_id,params); if err is not null then return err; end if;
  if not palabra_private.identity_allowed() then return palabra_private.fail('BUSY'); end if;
  if palabra_private.current_profile() is not null then return palabra_private.fail('ALREADY_REGISTERED'); end if;
  if palabra_private.failure_limited('recover:'||auth.uid()) then return palabra_private.fail('RATE_LIMITED'); end if;
  if p_operation_id is null or p_next_hash is null or p_next_hash !~ '^[a-f0-9]{64}$' then return palabra_private.fail('INVALID_INPUT'); end if;
  select profile_id into actor from palabra_private.recovery_credentials where code_hash=palabra_private.digest(normalized) and normalized ~ '^[a-f0-9]{64}$' for update;
  if actor is null then
    perform palabra_private.consume('recover:'||auth.uid(),date_trunc('hour',now()),5);
    return palabra_private.fail('INVALID_CODE');
  end if;
  if p_next_hash=palabra_private.digest(normalized) or exists(select 1 from palabra_private.recovery_credentials where code_hash=p_next_hash) then return palabra_private.fail('INVALID_INPUT'); end if;
  perform 1 from public.palabra_profiles where id=actor for update;
  update palabra_private.device_bindings set active=false where profile_id=actor;
  insert into palabra_private.device_bindings values(auth.uid(),actor,true);
  update public.palabra_profiles set device_generation=device_generation+1 where id=actor;
  update palabra_private.recovery_credentials set code_hash=p_next_hash where profile_id=actor;
  return palabra_private.receipt(p_operation_id,params,palabra_private.ok(palabra_private.self_data(actor)));
end $$;
create function public.palabra_rotate_recovery(p_next_hash text,p_operation_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare err jsonb; actor uuid; params jsonb:=jsonb_build_array('rotate',p_next_hash);
begin
  err:=palabra_private.guard(); if err is not null then return err; end if;
  actor:=palabra_private.current_profile(); if actor is null then return palabra_private.identity_error(); end if;
  err:=palabra_private.replay(p_operation_id,params); if err is not null then return err; end if;
  if not palabra_private.write_allowed() then return palabra_private.fail('RATE_LIMITED'); end if;
  if p_operation_id is null or p_next_hash is null or p_next_hash !~ '^[a-f0-9]{64}$' or exists(select 1 from palabra_private.recovery_credentials where code_hash=p_next_hash) then return palabra_private.fail('INVALID_INPUT'); end if;
  update palabra_private.recovery_credentials set code_hash=p_next_hash where profile_id=actor;
  return palabra_private.receipt(p_operation_id,params,palabra_private.ok(jsonb_build_object('deviceGeneration',(select device_generation from public.palabra_profiles where id=actor))));
end $$;
create function public.palabra_update_profile(p_nickname text,p_receive_nudges boolean,p_operation_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare err jsonb; actor uuid; params jsonb:=jsonb_build_array('update',p_nickname,p_receive_nudges);
begin
  err:=palabra_private.guard(); if err is not null then return err; end if;
  actor:=palabra_private.current_profile(); if actor is null then return palabra_private.identity_error(); end if;
  err:=palabra_private.replay(p_operation_id,params); if err is not null then return err; end if;
  if not palabra_private.write_allowed() then return palabra_private.fail('RATE_LIMITED'); end if;
  if p_operation_id is null or p_nickname is null or char_length(btrim(p_nickname)) not between 1 and 20 or p_receive_nudges is null then return palabra_private.fail('INVALID_INPUT'); end if;
  update public.palabra_profiles set nickname=btrim(p_nickname),receive_nudges=p_receive_nudges where id=actor;
  return palabra_private.receipt(p_operation_id,params,palabra_private.ok(palabra_private.self_data(actor)));
end $$;
revoke all on all functions in schema palabra_private from public,anon,authenticated;
do $$declare f record; begin
  for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname like 'palabra\_%' escape '\' loop
    execute format('revoke all on function %s from public, anon, authenticated',f.signature);
    execute format('grant execute on function %s to authenticated',f.signature);
  end loop;
end $$;
