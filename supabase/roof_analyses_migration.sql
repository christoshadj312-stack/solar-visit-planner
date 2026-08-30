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
