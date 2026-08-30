alter table public.customers
  add column if not exists completed_at timestamptz,
  add column if not exists cancelled_at timestamptz;

alter table public.customers
  drop constraint if exists customers_status_check;

alter table public.customers
  add constraint customers_status_check
  check (status in ('Scheduled', 'Completed', 'Cancelled'));

update public.customers
set status = 'Completed', completed_at = coalesce(completed_at, updated_at, now())
where lower(status) in ('completed', 'visited', 'done', 'accepted');

update public.customers
set status = 'Cancelled', cancelled_at = coalesce(cancelled_at, updated_at, now())
where lower(status) in ('cancelled', 'canceled', 'rejected');

update public.customers
set status = 'Scheduled'
where status is null or status not in ('Scheduled', 'Completed', 'Cancelled');