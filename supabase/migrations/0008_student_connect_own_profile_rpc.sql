-- Fix: turning Connect on failed with "permission denied for table student_profiles".
-- Cause: client upsert/own-row lookup touch user_id, which has no column grant (by design:
-- the directory must never expose user_id). Own profile access now goes through
-- security-definer functions keyed strictly on auth.uid(). No grants are widened.
create or replace function public.my_student_profile()
returns table (student_id text, display_name text, opted_in boolean)
language sql stable security definer set search_path = public as $$
  select sp.student_id, sp.display_name, sp.opted_in from public.student_profiles sp where sp.user_id = auth.uid();
$$;
create or replace function public.student_opt_in(p_display_name text)
returns table (student_id text, display_name text, opted_in boolean)
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_name text := nullif(btrim(p_display_name), '');
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if v_name is null then raise exception 'name required'; end if;
  insert into public.student_profiles (user_id, display_name, opted_in) values (v_uid, left(v_name, 60), true)
  on conflict (user_id) do update set display_name = excluded.display_name, opted_in = true;
  return query select sp.student_id, sp.display_name, sp.opted_in from public.student_profiles sp where sp.user_id = v_uid;
end $$;
revoke all on function public.my_student_profile() from public, anon;
revoke all on function public.student_opt_in(text) from public, anon;
grant execute on function public.my_student_profile() to authenticated;
grant execute on function public.student_opt_in(text) to authenticated;

create or replace function public.student_opt_out() returns void
language sql security definer set search_path = public as $$
  update public.student_profiles set opted_in = false where user_id = auth.uid();
$$;
create or replace function public.student_rename(p_display_name text) returns void
language plpgsql security definer set search_path = public as $$
declare v_name text := nullif(btrim(p_display_name), '');
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if v_name is null then raise exception 'name required'; end if;
  update public.student_profiles set display_name = left(v_name, 60) where user_id = auth.uid();
end $$;
revoke all on function public.student_opt_out() from public, anon;
revoke all on function public.student_rename(text) from public, anon;
grant execute on function public.student_opt_out() to authenticated;
grant execute on function public.student_rename(text) to authenticated;
-- listRequests embedded student_profiles through the user_id foreign key, which also needs
-- SELECT on user_id (denied by design). Participants' requests now come from a
-- security-definer function that applies the same visibility the directory policy had:
-- the counterpart's name + ID show only when BOTH the reader and that student are opted in.
create or replace function public.my_student_requests()
returns table (id uuid, sender_id uuid, recipient_id uuid, first_message text, status text, created_at timestamptz, sender jsonb, recipient jsonb)
language sql stable security definer set search_path = public as $$
  select r.id, r.sender_id, r.recipient_id, r.first_message, r.status::text, r.created_at,
    case when public.is_student_active(auth.uid()) then (select jsonb_build_object('student_id', p.student_id, 'display_name', p.display_name) from public.student_profiles p where p.user_id = r.sender_id and p.opted_in) end,
    case when public.is_student_active(auth.uid()) then (select jsonb_build_object('student_id', p.student_id, 'display_name', p.display_name) from public.student_profiles p where p.user_id = r.recipient_id and p.opted_in) end
  from public.student_requests r
  where auth.uid() in (r.sender_id, r.recipient_id)
  order by r.created_at desc;
$$;
revoke all on function public.my_student_requests() from public, anon;
grant execute on function public.my_student_requests() to authenticated;
