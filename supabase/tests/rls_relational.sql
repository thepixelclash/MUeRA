-- RLS test for relational tables. Run on a TEST Supabase project. NOT RUN YET (needs a live project). Rolls back.
begin;
insert into auth.users (id, instance_id, aud, role, email) values
 ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','a@test.invalid'),
 ('00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-000000000000','authenticated','authenticated','b@test.invalid');
set local role authenticated;
do $$
declare t text; n int; ua uuid := '00000000-0000-0000-0000-0000000000a1'; ub uuid := '00000000-0000-0000-0000-0000000000b2';
begin
  perform set_config('request.jwt.claims', '{"sub":"'||ua||'","role":"authenticated"}', true);
  insert into public.tasks(user_id,id,title,type,date) values (ua,'t1','A task','assignment','2026-11-01');
  insert into public.subjects(user_id,id,name) values (ua,'s1','Maths');
  insert into public.chat_messages(user_id,idx,role,content) values (ua,0,'user','hi');
  begin insert into public.tasks(user_id,id,title,type,date) values (ub,'x','forged','quiz','2026-11-01'); raise exception 'FAIL A inserted for B';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims', '{"sub":"'||ub||'","role":"authenticated"}', true);
  foreach t in array array['tasks','subjects','chat_messages'] loop
    execute format('select count(*) from public.%I', t) into n;
    if n <> 0 then raise exception 'FAIL B sees % rows in %', n, t; end if;
  end loop;
  update public.tasks set title='hacked' where id='t1'; get diagnostics n = row_count; if n<>0 then raise exception 'FAIL B updated A'; end if;
  delete from public.tasks where id='t1'; get diagnostics n = row_count; if n<>0 then raise exception 'FAIL B deleted A'; end if;
  perform set_config('request.jwt.claims', '{"sub":"'||ua||'","role":"authenticated"}', true);
  select count(*) into n from public.tasks where title='A task'; if n<>1 then raise exception 'FAIL A lost data'; end if;
  begin insert into public.tasks(user_id,id,title,type,date) values (ua,'t2','bad','nope','2026-11-01'); raise exception 'FAIL bad type accepted';
  exception when check_violation then null; end;
end $$;
select 'relational RLS test passed' as result;
rollback;
