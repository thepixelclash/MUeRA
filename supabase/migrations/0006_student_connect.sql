-- Student Connect: opt-in 1:1 student chat with message requests.
-- Consent model: a student is never visible or contactable until they explicitly opt in.
-- Visibility is limited to display name + generated student ID (column-level grants);
-- emails and existing private app data stay behind the per-user tables from 0003.

create table if not exists public.student_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  student_id text not null unique check (student_id ~ '^MU-[A-Z2-9]{6}$'),
  display_name text not null check (length(display_name) between 1 and 60),
  opted_in boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Generates a random readable ID (no confusing chars) when the row arrives without one.
create or replace function public.student_id_fill() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  cand text;
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  i int;
begin
  if new.student_id is not null and length(new.student_id) > 0 then
    new.student_id := upper(new.student_id);
    return new;
  end if;
  loop
    cand := 'MU-';
    for i in 1..6 loop
      cand := cand || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.student_profiles sp where sp.student_id = cand);
  end loop;
  new.student_id := cand;
  return new;
end $$;
drop trigger if exists student_id_fill on public.student_profiles;
create trigger student_id_fill before insert on public.student_profiles
  for each row execute function public.student_id_fill();
drop trigger if exists student_profiles_touch on public.student_profiles;
create trigger student_profiles_touch before update on public.student_profiles
  for each row execute function public.touch_updated_at();

create table if not exists public.student_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.student_profiles(user_id) on delete cascade,
  recipient_id uuid not null references public.student_profiles(user_id) on delete cascade,
  first_message text not null check (length(first_message) between 1 and 2000),
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (sender_id <> recipient_id)
);
-- One live request per direction; a declined request can be retried later.
create unique index if not exists student_requests_live_pair
  on public.student_requests (sender_id, recipient_id) where status in ('pending','accepted');
drop trigger if exists student_requests_touch on public.student_requests;
create trigger student_requests_touch before update on public.student_requests
  for each row execute function public.touch_updated_at();

create table if not exists public.student_messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.student_requests(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists student_messages_request_idx on public.student_messages (request_id, created_at);

alter table public.student_profiles enable row level security;
alter table public.student_requests enable row level security;
alter table public.student_messages enable row level security;

-- Profiles: full access to your own row; everyone signed in sees ONLY opted-in rows,
-- and only the directory columns (student_id, display_name, opted_in) - never user_id or emails.
drop policy if exists "own select" on public.student_profiles;
create policy "own select" on public.student_profiles for select to authenticated using (auth.uid() = user_id);
drop policy if exists "directory select" on public.student_profiles;
create policy "directory select" on public.student_profiles for select to authenticated using (opted_in);
drop policy if exists "own insert" on public.student_profiles;
create policy "own insert" on public.student_profiles for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "own update" on public.student_profiles;
create policy "own update" on public.student_profiles for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own delete" on public.student_profiles;
create policy "own delete" on public.student_profiles for delete to authenticated using (auth.uid() = user_id);

-- Requests: only an opted-in student can send one, only to an opted-in student.
drop policy if exists "send request" on public.student_requests;
create policy "send request" on public.student_requests for insert to authenticated with check (
  auth.uid() = sender_id
  and exists (select 1 from public.student_profiles p where p.user_id = sender_id and p.opted_in)
  and exists (select 1 from public.student_profiles p where p.user_id = recipient_id and p.opted_in)
);
drop policy if exists "read own requests" on public.student_requests;
create policy "read own requests" on public.student_requests for select to authenticated
  using (auth.uid() = sender_id or auth.uid() = recipient_id);
drop policy if exists "recipient responds" on public.student_requests;
create policy "recipient responds" on public.student_requests for update to authenticated
  using (auth.uid() = recipient_id and status = 'pending')
  with check (auth.uid() = recipient_id and status in ('accepted','declined'));

-- Messages: only the two people on an ACCEPTED request can read or add messages.
drop policy if exists "read chat" on public.student_messages;
create policy "read chat" on public.student_messages for select to authenticated using (
  exists (select 1 from public.student_requests r
          where r.id = request_id and r.status = 'accepted'
            and (r.sender_id = auth.uid() or r.recipient_id = auth.uid()))
);
drop policy if exists "send chat" on public.student_messages;
create policy "send chat" on public.student_messages for insert to authenticated with check (
  auth.uid() = sender_id
  and exists (select 1 from public.student_requests r
              where r.id = request_id and r.status = 'accepted'
                and (r.sender_id = auth.uid() or r.recipient_id = auth.uid()))
);

revoke all on public.student_profiles from anon;
revoke all on public.student_requests from anon;
revoke all on public.student_messages from anon;
-- Column-level grants: the directory can never expose user_id, timestamps or anything else.
grant select (student_id, display_name, opted_in) on public.student_profiles to authenticated;
grant insert (user_id, student_id, display_name, opted_in) on public.student_profiles to authenticated;
grant update (display_name, opted_in) on public.student_profiles to authenticated;
grant delete on public.student_profiles to authenticated;
grant select (id, sender_id, recipient_id, first_message, status, created_at) on public.student_requests to authenticated;
grant insert (sender_id, recipient_id, first_message) on public.student_requests to authenticated;
grant update (status) on public.student_requests to authenticated;
grant select (id, request_id, sender_id, body, created_at) on public.student_messages to authenticated;
grant insert (request_id, sender_id, body) on public.student_messages to authenticated;

-- Sends a message request addressed by student ID. Security definer because the directory
-- never exposes user_ids; every consent check is enforced here before the insert.
create or replace function public.send_student_request(p_student_id text, p_message text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_sender uuid := auth.uid();
  v_recipient uuid;
begin
  if v_sender is null then raise exception 'not signed in'; end if;
  if p_message is null or char_length(trim(p_message)) < 1 or char_length(p_message) > 2000 then
    raise exception 'message must be 1-2000 characters';
  end if;
  select sp.user_id into v_recipient from public.student_profiles sp
    where sp.student_id = upper(trim(p_student_id)) and sp.opted_in;
  if v_recipient is null then raise exception 'no opted-in student with that ID'; end if;
  if v_recipient = v_sender then raise exception 'you cannot message yourself'; end if;
  if not exists (select 1 from public.student_profiles p where p.user_id = v_sender and p.opted_in) then
    raise exception 'turn on Student Connect first';
  end if;
  insert into public.student_requests (sender_id, recipient_id, first_message)
    values (v_sender, v_recipient, p_message);
end $$;
revoke all on function public.send_student_request(text, text) from anon;
grant execute on function public.send_student_request(text, text) to authenticated;

-- Supabase default privileges grant table-level ALL to authenticated on new tables;
-- revoke it so only the column-level grants above apply (directory stays name + ID only).
revoke all on public.student_profiles from authenticated;
revoke all on public.student_requests from authenticated;
revoke all on public.student_messages from authenticated;
grant select (student_id, display_name, opted_in) on public.student_profiles to authenticated;
grant insert (user_id, student_id, display_name, opted_in) on public.student_profiles to authenticated;
grant update (display_name, opted_in) on public.student_profiles to authenticated;
grant delete on public.student_profiles to authenticated;
grant select (id, sender_id, recipient_id, first_message, status, created_at) on public.student_requests to authenticated;
grant insert (sender_id, recipient_id, first_message) on public.student_requests to authenticated;
grant update (status) on public.student_requests to authenticated;
grant select (id, request_id, sender_id, body, created_at) on public.student_messages to authenticated;
grant insert (request_id, sender_id, body) on public.student_messages to authenticated;
