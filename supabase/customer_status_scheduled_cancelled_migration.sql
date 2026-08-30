update public.customers
set status = case
  when lower(status) in ('cancelled', 'canceled', 'rejected') then 'Cancelled'
  else 'Scheduled'
end
where status is distinct from case
  when lower(status) in ('cancelled', 'canceled', 'rejected') then 'Cancelled'
  else 'Scheduled'
end;

alter table public.customers
  drop constraint if exists customers_status_check;

alter table public.customers
  add constraint customers_status_check
  check (status in ('Scheduled', 'Cancelled'));
