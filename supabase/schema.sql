create extension if not exists "pgcrypto";

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  full_name text not null,
  address text not null,
  phone text not null,
  email text,
  notes text,
  status text not null default 'Scheduled'
    check (status in ('Scheduled', 'Completed', 'Cancelled')),
  appointment_date date not null,
  appointment_time time not null,
  latitude double precision,
  longitude double precision,
  route_order integer,
  route_optimized_at timestamptz,
  roof_plan_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customers_user_appointment_idx
  on public.customers (user_id, appointment_date, appointment_time);

alter table public.customers enable row level security;

alter table public.customers
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists route_order integer,
  add column if not exists route_optimized_at timestamptz;

create index if not exists customers_user_route_day_idx
  on public.customers (user_id, appointment_date, route_order);

drop policy if exists "Users can read their own customers" on public.customers;
create policy "Users can read their own customers"
  on public.customers for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own customers" on public.customers;
create policy "Users can insert their own customers"
  on public.customers for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own customers" on public.customers;
create policy "Users can update their own customers"
  on public.customers for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own customers" on public.customers;
create policy "Users can delete their own customers"
  on public.customers for delete
  using (auth.uid() = user_id);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists customers_set_updated_at on public.customers;
create trigger customers_set_updated_at
before update on public.customers
for each row execute function public.set_updated_at();

create table if not exists public.roof_analyses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  overall_score integer not null default 0,
  roof_type text,
  roof_material text,
  roof_condition text,
  available_area text,
  estimated_panel_count integer not null default 0,
  estimated_system_kwp numeric not null default 0,
  shading_level text,
  installation_difficulty text,
  confidence integer not null default 0,
  obstacles jsonb not null default '[]'::jsonb,
  advantages jsonb not null default '[]'::jsonb,
  recommendations jsonb not null default '[]'::jsonb,
  summary text,
  raw_response jsonb,
  model text,
  created_at timestamptz not null default now()
);

alter table public.roof_analyses
  add column if not exists customer_id uuid references public.customers(id) on delete cascade,
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists overall_score integer not null default 0,
  add column if not exists roof_type text,
  add column if not exists roof_material text,
  add column if not exists roof_condition text,
  add column if not exists available_area text,
  add column if not exists estimated_panel_count integer not null default 0,
  add column if not exists estimated_system_kwp numeric not null default 0,
  add column if not exists shading_level text,
  add column if not exists installation_difficulty text,
  add column if not exists confidence integer not null default 0,
  add column if not exists obstacles jsonb not null default '[]'::jsonb,
  add column if not exists advantages jsonb not null default '[]'::jsonb,
  add column if not exists recommendations jsonb not null default '[]'::jsonb,
  add column if not exists summary text,
  add column if not exists raw_response jsonb,
  add column if not exists model text,
  add column if not exists created_at timestamptz not null default now();

create index if not exists roof_analyses_customer_created_idx
  on public.roof_analyses (customer_id, created_at desc);

create index if not exists roof_analyses_user_created_idx
  on public.roof_analyses (user_id, created_at desc);

alter table public.roof_analyses enable row level security;

drop policy if exists "Users can read their own roof analyses" on public.roof_analyses;
create policy "Users can read their own roof analyses"
  on public.roof_analyses for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own roof analyses" on public.roof_analyses;
create policy "Users can insert their own roof analyses"
  on public.roof_analyses for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own roof analyses" on public.roof_analyses;
create policy "Users can delete their own roof analyses"
  on public.roof_analyses for delete
  using (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('roof-plans', 'roof-plans', true)
on conflict (id) do nothing;

drop policy if exists "Users can upload roof plans" on storage.objects;
create policy "Users can upload roof plans"
  on storage.objects for insert
  with check (
    bucket_id = 'roof-plans'
    and auth.role() = 'authenticated'
  );

drop policy if exists "Users can read roof plans" on storage.objects;
create policy "Users can read roof plans"
  on storage.objects for select
  using (bucket_id = 'roof-plans');

drop policy if exists "Users can replace roof plans" on storage.objects;
create policy "Users can replace roof plans"
  on storage.objects for update
  using (
    bucket_id = 'roof-plans'
    and auth.role() = 'authenticated'
  );

create table if not exists public.sms_queue (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete set null,
  phone text not null,
  message text not null,
  appointment_date date not null,
  appointment_time text,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed')),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  error text,
  constraint sms_queue_unique_customer_appointment
    unique (customer_id, appointment_date, appointment_time)
);

create index if not exists sms_queue_status_created_idx
  on public.sms_queue (status, created_at);

create index if not exists sms_queue_customer_date_idx
  on public.sms_queue (customer_id, appointment_date);

alter table public.sms_queue enable row level security;
