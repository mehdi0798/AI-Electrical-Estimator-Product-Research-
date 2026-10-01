-- v0.1 Step 4 — logging table for the participant app.
-- Run this in the Supabase SQL editor (no CLI wired up in v0.1).
--
-- Named event_log (not "events") to avoid the reserved-word ambiguity.
-- Hard rule 5: this table is the ONLY source of scoring — never lose an event.
-- Hard rule (Tech/RLS): the browser's anon key may INSERT only. No SELECT,
-- UPDATE, or DELETE from the client.

create table if not exists public.event_log (
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
alter table public.event_log enable row level security;

-- A single policy: the anon role may INSERT and nothing else. With no SELECT /
-- UPDATE / DELETE policy, those are denied by default under RLS.
drop policy if exists event_log_anon_insert on public.event_log;
create policy event_log_anon_insert
  on public.event_log
  for insert
  to anon
  with check (true);
