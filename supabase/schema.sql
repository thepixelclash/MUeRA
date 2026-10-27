-- Run this in Supabase SQL Editor. Each signed-in user can access only their own row.
create table if not exists public.user_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.user_data enable row level security;
drop policy if exists "Users can read own MUeRA data" on public.user_data;
create policy "Users can read own MUeRA data" on public.user_data for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Users can insert own MUeRA data" on public.user_data;
create policy "Users can insert own MUeRA data" on public.user_data for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Users can update own MUeRA data" on public.user_data;
create policy "Users can update own MUeRA data" on public.user_data for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Hardening for public.user_data (run after schema.sql / 0001). Idempotent.
drop policy if exists "Users can delete own MUeRA data" on public.user_data;
create policy "Users can delete own MUeRA data" on public.user_data
  for delete to authenticated using (auth.uid() = user_id);

-- Limit document size (2 MB) and require a JSON object.
alter table public.user_data drop constraint if exists user_data_shape;
alter table public.user_data add constraint user_data_shape
  check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 2097152);

-- Server-side updated_at.
create or replace function public.touch_user_data() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists user_data_touch on public.user_data;
create trigger user_data_touch before update on public.user_data
  for each row execute function public.touch_user_data();

-- Anonymous users get nothing.
revoke all on public.user_data from anon;
grant select, insert, update, delete on public.user_data to authenticated;
-- Relational per-user storage. Every table: user_id FK -> auth.users (cascade), RLS, 4 policies, timestamps.
-- Existing data in public.user_data is kept (never dropped); the app copies it into these tables on first sign-in.
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create table if not exists public.subjects (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (length(id) between 1 and 64),
  name text not null check (length(name) between 1 and 200),
  difficulty int not null default 3 check (difficulty between 1 and 5),
  attended int not null default 0 check (attended >= 0),
  conducted int not null default 0 check (conducted >= 0),
  kind text,
  demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create table if not exists public.tasks (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (length(id) between 1 and 64),
  title text not null check (length(title) between 1 and 500),
  subject text not null default '' check (length(subject) <= 200),
  type text not null check (type in ('assignment','quiz','exam','class','study','personal')),
  date text not null check (date ~ '^\d{4}-\d{2}-\d{2}$'),
  time text check (time is null or time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  duration_min int check (duration_min is null or duration_min between 1 and 1440),
  done boolean not null default false,
  reminder_min int check (reminder_min is null or reminder_min >= 0),
  notes text check (notes is null or length(notes) <= 5000),
  for_task_id text,
  planned boolean not null default false,
  priority text check (priority is null or priority in ('low','medium','high')),
  demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists tasks_user_date_idx on public.tasks (user_id, date);
create table if not exists public.timetable_slots (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (length(id) between 1 and 64),
  day int not null check (day between 0 and 6),
  subject text not null check (length(subject) <= 200),
  start_time text not null,
  end_time text not null,
  room text,
  subject_id text,
  kind text,
  effective_date text,
  end_date text,
  single_date text,
  demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create table if not exists public.attendance_records (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (length(id) between 1 and 128),
  slot_id text not null,
  subject_id text not null,
  date text not null check (date ~ '^\d{4}-\d{2}-\d{2}$'),
  start_time text not null,
  end_time text not null,
  status text not null check (status in ('Present','Absent','Cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists attendance_user_date_idx on public.attendance_records (user_id, date);
create table if not exists public.documents (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (length(id) between 1 and 64),
  name text not null check (length(name) <= 500),
  pages int not null default 0 check (pages >= 0),
  extracted_text text not null default '' check (length(extracted_text) <= 500000),
  ai_cache jsonb not null default '{}'::jsonb,
  demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create table if not exists public.chat_messages (
  user_id uuid not null references auth.users(id) on delete cascade,
  idx int not null check (idx >= 0),
  role text not null check (role in ('user','assistant')),
  content text not null check (length(content) <= 20000),
  local boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, idx)
);
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  threshold int not null default 75 check (threshold between 0 and 100),
  study_hours_per_day numeric not null default 2 check (study_hours_per_day between 0 and 24),
  session_min int not null default 45 check (session_min between 5 and 600),
  study_start text not null default '18:00',
  plan_note text not null default '' check (length(plan_note) <= 20000),
  ai_calls int not null default 0 check (ai_calls >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['subjects','tasks','timetable_slots','attendance_records','documents','chat_messages','user_settings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own select" on public.%I', t);
    execute format('drop policy if exists "own insert" on public.%I', t);
    execute format('drop policy if exists "own update" on public.%I', t);
    execute format('drop policy if exists "own delete" on public.%I', t);
    execute format('create policy "own select" on public.%I for select to authenticated using (auth.uid() = user_id)', t);
    execute format('create policy "own insert" on public.%I for insert to authenticated with check (auth.uid() = user_id)', t);
    execute format('create policy "own update" on public.%I for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
    execute format('create policy "own delete" on public.%I for delete to authenticated using (auth.uid() = user_id)', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.touch_updated_at()', t || '_touch', t);
  end loop;
end $$;
-- Optional pointer to the uploaded file in the user's own Google Drive (drive.file scope).
alter table public.documents add column if not exists drive_file_id text check (drive_file_id is null or length(drive_file_id) <= 200);
-- Optional pointer to the scanned timetable file in the user's own Google Drive.
alter table public.timetable_slots add column if not exists source_file_id text check (source_file_id is null or length(source_file_id) <= 200);
