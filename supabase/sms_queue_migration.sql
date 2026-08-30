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
