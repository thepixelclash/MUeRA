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
