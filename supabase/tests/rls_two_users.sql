-- RLS test: run in the Supabase SQL editor on a TEST project. NOT RUN YET (needs a live project).
-- Creates two fake users, checks isolation, then rolls everything back.
begin;
insert into auth.users (id, instance_id, aud, role, email)
values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','a@test.invalid'),
       ('00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-000000000000','authenticated','authenticated','b@test.invalid');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}',true);
insert into public.user_data(user_id,data) values ('00000000-0000-0000-0000-0000000000a1','{"tasks":["A"]}');
-- A cannot write a row for B
do $$ begin
  begin insert into public.user_data(user_id,data) values ('00000000-0000-0000-0000-0000000000b2','{}');
    raise exception 'FAIL: A inserted for B';
  exception when insufficient_privilege or check_violation then null; end;
end $$;

select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}',true);
insert into public.user_data(user_id,data) values ('00000000-0000-0000-0000-0000000000b2','{"tasks":["B"]}');
do $$ begin
  if (select count(*) from public.user_data) <> 1 then raise exception 'FAIL: B sees %, expected 1 row', (select count(*) from public.user_data); end if;
  update public.user_data set data='{"x":1}' where user_id='00000000-0000-0000-0000-0000000000a1';
  if found then raise exception 'FAIL: B updated A'; end if;
  delete from public.user_data where user_id='00000000-0000-0000-0000-0000000000a1';
  if found then raise exception 'FAIL: B deleted A'; end if;
end $$;
select 'RLS two-user test passed' as result;
rollback;
