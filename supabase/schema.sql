-- Business Search database schema.
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- Safe to re-run: it only creates things that don't exist yet.

create table if not exists business_types (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  -- Extra fields specific to this type, e.g. [{"key":"machines","label":"Machine count","kind":"number"}]
  fields jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists owners (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  phone text,
  email text,
  mailing_address text,
  do_not_contact boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists businesses (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  type_id uuid references business_types on delete set null,
  owner_id uuid references owners on delete set null,
  name text not null,
  address text,
  city text,
  state text,
  zip text,
  phone text,
  email text,
  website text,
  hours text,
  lat double precision,
  lng double precision,
  geocode_status text not null default 'pending', -- pending | ok | failed | manual
  stage text not null default 'prospect',
  priority int not null default 2,                 -- 1 high, 2 normal, 3 low
  ruled_out boolean not null default false,
  rule_out_reason text,
  rule_out_note text,
  revisit_date date,
  next_action_date date,
  next_action_note text,
  revenue numeric,
  sde numeric,
  asking_price numeric,
  source text,
  notes text,
  custom jsonb not null default '{}'::jsonb,
  last_activity_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists activities (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  business_id uuid not null references businesses on delete cascade,
  kind text not null,     -- call | postcard | letter | email | text | door_knock | meeting | note
  outcome text,
  notes text,
  campaign text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists routes (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  start_label text,
  start_lat double precision,
  start_lng double precision,
  end_label text,
  end_lat double precision,
  end_lng double precision,
  stops jsonb not null default '[]'::jsonb,   -- ordered [{business_id, done}]
  distance_m double precision,
  duration_s double precision,
  geometry jsonb,                              -- [[lat,lng], ...] for drawing on the map
  created_at timestamptz not null default now()
);

create table if not exists settings (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  ors_api_key text,
  knock_cooldown_days int not null default 30,
  default_start text,
  default_end text,
  created_at timestamptz not null default now()
);

create index if not exists businesses_user_idx on businesses (user_id);
create index if not exists activities_business_idx on activities (business_id);

-- Row level security: every row is visible only to the person who created it.
do $$
declare t text;
begin
  foreach t in array array['business_types','owners','businesses','activities','routes','settings'] loop
    execute format('alter table %I enable row level security', t);
    if not exists (select 1 from pg_policies where tablename = t and policyname = 'own rows') then
      execute format(
        'create policy "own rows" on %I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    end if;
  end loop;
end $$;
