-- Apply as a migration owner, never as the application login.
begin;
create schema if not exists apa_private;
revoke all on schema apa_private from public, anon, authenticated;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'apa_app') then
    create role apa_app nologin nosuperuser nocreatedb nocreaterole nobypassrls;
  end if;
end $$;
grant usage on schema apa_private to apa_app;

create table apa_private.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  username text not null unique check (username ~ '^[a-z0-9._-]{3,40}$'),
  full_name text not null check (length(full_name) between 1 and 120),
  email text not null unique check (email = lower(email)),
  role text not null check (role in ('admin', 'operator')),
  is_active boolean not null default true,
  auth_version bigint not null default 0,
  blocked_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check (deleted_at is null or not is_active)
);
create table apa_private.locations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 120),
  qr_token uuid not null unique default gen_random_uuid(),
  is_active boolean not null default true,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
create table apa_private.app_sessions (
  token_hash text primary key check (length(token_hash) = 64),
  user_id uuid not null references apa_private.profiles(id) on delete restrict,
  auth_tokens text not null,
  auth_expires_at timestamptz not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default clock_timestamp()
);
create index sessions_user on apa_private.app_sessions(user_id);
create table apa_private.movements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references apa_private.profiles(id) on delete restrict,
  location_id uuid not null references apa_private.locations(id) on delete restrict,
  user_name_snapshot text not null,
  location_name_snapshot text not null,
  request_id uuid not null,
  recorded_at timestamptz not null default clock_timestamp(),
  unique (user_id, request_id)
);
create index movements_history on apa_private.movements(recorded_at desc, id desc);
create index movements_own on apa_private.movements(user_id, recorded_at desc, id desc);
create table apa_private.admin_operations (
  id uuid primary key,
  actor_id uuid not null references apa_private.profiles(id),
  target_id uuid references apa_private.profiles(id),
  kind text not null check (kind in ('create', 'email', 'password')),
  desired jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'complete', 'cancelled')),
  created_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz
);
create unique index reserved_username on apa_private.admin_operations((desired->>'username'))
  where status = 'pending' and kind = 'create';
create unique index reserved_email on apa_private.admin_operations((desired->>'email'))
  where status = 'pending' and kind in ('create', 'email');
create unique index pending_account_operation on apa_private.admin_operations(target_id)
  where status = 'pending';
create table apa_private.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references apa_private.profiles(id),
  target_id uuid,
  action text not null,
  result text not null,
  created_at timestamptz not null default clock_timestamp()
);
create table apa_private.rate_limits (
  key_hash text primary key,
  window_at timestamptz not null default clock_timestamp(),
  attempts integer not null default 1
);

-- Credential-affecting changes invalidate every app session, including sessions
-- on other devices. Version checks also reject an in-flight stale login.
create function apa_private.version_profile() returns trigger
language plpgsql set search_path = pg_catalog as $$
begin
  new.auth_version := old.auth_version;
  if row(new.username,new.email,new.role,new.is_active,new.blocked_at,new.deleted_at)
     is distinct from row(old.username,old.email,old.role,old.is_active,old.blocked_at,old.deleted_at) then
    new.auth_version := old.auth_version + 1;
  end if;
  new.updated_at := clock_timestamp();
  return new;
end $$;
create trigger profile_version before update on apa_private.profiles
for each row execute function apa_private.version_profile();

create function apa_private.revoke_changed_profile_sessions() returns trigger
language plpgsql set search_path = pg_catalog as $$
begin
  if new.auth_version <> old.auth_version then
    update apa_private.app_sessions set revoked_at = clock_timestamp()
      where user_id = new.id and revoked_at is null;
  end if;
  return new;
end $$;
create trigger profile_sessions after update on apa_private.profiles
for each row execute function apa_private.revoke_changed_profile_sessions();

-- An immutable QR cannot silently be reassigned by renaming a location.
create function apa_private.keep_qr_token() returns trigger
language plpgsql set search_path = pg_catalog as $$
begin
  if new.qr_token <> old.qr_token then
    raise exception 'QR token is immutable' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger location_qr_immutable before update on apa_private.locations
for each row execute function apa_private.keep_qr_token();
revoke all on function apa_private.keep_qr_token() from public, anon, authenticated;

alter table apa_private.profiles enable row level security;
alter table apa_private.locations enable row level security;
alter table apa_private.app_sessions enable row level security;
alter table apa_private.movements enable row level security;
alter table apa_private.admin_operations enable row level security;
alter table apa_private.audit_events enable row level security;
alter table apa_private.rate_limits enable row level security;
create policy app_profiles on apa_private.profiles to apa_app using (true) with check (true);
create policy app_locations on apa_private.locations to apa_app using (true) with check (true);
create policy app_sessions on apa_private.app_sessions to apa_app using (true) with check (true);
create policy app_movements on apa_private.movements to apa_app using (true) with check (true);
create policy app_operations on apa_private.admin_operations to apa_app using (true) with check (true);
create policy app_audit on apa_private.audit_events to apa_app using (true) with check (true);
create policy app_limits on apa_private.rate_limits to apa_app using (true) with check (true);
revoke all on all tables in schema apa_private from public, anon, authenticated;
revoke all on all functions in schema apa_private from public, anon, authenticated;
grant select, insert, update on apa_private.profiles, apa_private.locations,
  apa_private.app_sessions, apa_private.admin_operations, apa_private.rate_limits to apa_app;
grant select, insert on apa_private.movements, apa_private.audit_events to apa_app;
alter default privileges in schema apa_private revoke all on tables from public, anon, authenticated;
alter default privileges in schema apa_private revoke execute on functions from public, anon, authenticated;
commit;
