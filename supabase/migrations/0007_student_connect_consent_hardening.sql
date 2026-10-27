-- Student Connect consent hardening.
-- 1) Directory is visible only to students who are themselves opted in (no enumeration by non-participants).
-- 2) Chat writes require BOTH parties currently opted in: turning Connect off freezes existing chats
--    (history stays readable by the two participants; nothing is deleted).
-- 3) A decline is final per direction: the sender can never re-request; the recipient keeps control
--    and can still initiate the reverse direction themselves if they change their mind.

-- RLS-free membership check (security definer avoids recursive policy evaluation).
create or replace function public.is_student_active(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.student_profiles sp where sp.user_id = p and sp.opted_in);
$$;
revoke all on function public.is_student_active(uuid) from anon;
grant execute on function public.is_student_active(uuid) to authenticated;

-- 1) Gate the directory on the reader being opted in too.
drop policy if exists "directory select" on public.student_profiles;
create policy "directory select" on public.student_profiles for select to authenticated
  using (opted_in and public.is_student_active(auth.uid()));

-- 2) Both parties must be opted in for every chat write.
drop policy if exists "send chat" on public.student_messages;
create policy "send chat" on public.student_messages for insert to authenticated with check (
  auth.uid() = sender_id
  and exists (select 1 from public.student_requests r
              where r.id = request_id and r.status = 'accepted'
                and (r.sender_id = auth.uid() or r.recipient_id = auth.uid())
                and public.is_student_active(r.sender_id)
                and public.is_student_active(r.recipient_id))
);

-- 3) One request per direction, ever. A decline cannot be bypassed by re-requesting.
drop index if exists public.student_requests_live_pair;
create unique index if not exists student_requests_pair on public.student_requests (sender_id, recipient_id);

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
  if exists (select 1 from public.student_requests r
             where r.sender_id = v_sender and r.recipient_id = v_recipient and r.status = 'declined') then
    raise exception 'this student declined your request';
  end if;
  if exists (select 1 from public.student_requests r
             where r.sender_id = v_sender and r.recipient_id = v_recipient) then
    raise exception 'you already have a request or chat with this student';
  end if;
  insert into public.student_requests (sender_id, recipient_id, first_message)
    values (v_sender, v_recipient, p_message);
end $$;
