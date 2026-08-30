alter table public.customers
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists route_order integer,
  add column if not exists route_optimized_at timestamptz;

create index if not exists customers_user_route_day_idx
  on public.customers (user_id, appointment_date, route_order);

comment on column public.customers.latitude is 'Customer latitude from backend geocoding for route optimization.';
comment on column public.customers.longitude is 'Customer longitude from backend geocoding for route optimization.';
comment on column public.customers.route_order is 'Optional persisted visit order for an optimized appointment day.';
comment on column public.customers.route_optimized_at is 'Timestamp for the latest persisted route optimization.';
