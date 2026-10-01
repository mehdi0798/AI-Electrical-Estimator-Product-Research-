import { createClient } from '@supabase/supabase-js'

// Vite exposes only VITE_*-prefixed vars to the client. The anon key is
// insert-only by RLS (supabase/migrations/0001_event_log.sql), so shipping it
// to the browser is intended.
const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// When env is missing (e.g. a fresh clone with no .env.local) the app must still
// run: events keep queuing in localStorage and flush once a client exists.
export const supabase = url && anonKey ? createClient(url, anonKey) : null

export const isSupabaseConfigured = Boolean(supabase)
