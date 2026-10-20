-- Product v1 logging table. Same columns and access rules as event_log
-- (0001_event_log.sql), kept separate so product use never mixes with study data.
-- Run this in the Supabase SQL editor.
--
-- The browser's anon key may INSERT only. No SELECT, UPDATE, or DELETE from the client.

create table if not exists public.product_event_log (
  id            bigint generated always as identity primary key,
  session_label text,
  participant   text,
  sheet         text,
  action        text not null,
  item_id       text,
  x             integer,
  y             integer,
  old_value     text,
  new_value     text,
  client_ts     bigint,          -- epoch ms from the browser (Date.now())
  server_ts     timestamptz not null default now()
);

-- Insert-only from the browser.
alter table public.product_event_log enable row level security;

-- A single policy: the anon role may INSERT and nothing else. With no SELECT /
-- UPDATE / DELETE policy, those are denied by default under RLS.
drop policy if exists product_event_log_anon_insert on public.product_event_log;
create policy product_event_log_anon_insert
  on public.product_event_log
  for insert
  to anon
  with check (true);
