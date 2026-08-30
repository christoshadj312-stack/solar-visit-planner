alter table public.calendar_events
  add column if not exists color text default '#20c997';

alter table public.calendar_events
  drop constraint if exists calendar_events_color_format_check;

alter table public.calendar_events
  add constraint calendar_events_color_format_check
  check (color is null or color ~ '^#[0-9A-Fa-f]{6}$');
