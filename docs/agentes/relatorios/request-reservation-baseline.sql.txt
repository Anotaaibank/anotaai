-- AUDIT REPRODUCTION ONLY, before BS-C implementation. Not a release acceptance test.
-- Confirms existing REQUEST limitations; no model/provider or financial operation.
-- Requires full previous migrations and the matching disposable QA runner marker.
begin;
do $$declare marker text:=coalesce(current_setting('anotei.test_run',true),'');begin
 if marker !~ '^anotei-disposable:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or current_database() is distinct from 'anotei_test_'||replace(split_part(marker,':',2),'-','') then
  raise exception 'DISPOSABLE_SQL_OPT_IN_REQUIRED';
 end if;
end $$;
insert into auth.users(id,email,aud,role,created_at,updated_at) values
 ('ca530001-1111-4111-8111-111111111111','request-a@example.invalid','authenticated','authenticated',now(),now()),
 ('ca530002-2222-4222-8222-222222222222','request-b@example.invalid','authenticated','authenticated',now(),now());
insert into public.anota_access_accounts(user_id,exempt) values
 ('ca530001-1111-4111-8111-111111111111',true),('ca530002-2222-4222-8222-222222222222',true);
create temporary table request_baseline_observations(case_name text,observation jsonb);
do $$
declare u uuid:='ca530001-1111-4111-8111-111111111111';other uuid:='ca530002-2222-4222-8222-222222222222';
 stuck uuid:=gen_random_uuid();race uuid:=gen_random_uuid();done uuid:=gen_random_uuid();
 r jsonb;first_result jsonb:='{"synthetic":"completed-proposal","saved":false}'::jsonb;settled boolean;
begin
 -- A worker dies after take, before settle. Move start far into the past; no sleep.
 r:=public.anota_usage_take(u,'REQUEST',stuck,1,repeat('a',64));
 if r ? 'error' or r ? 'duplicate' then raise exception 'INVALID_INITIAL_FIXTURE';end if;
 update public.anota_usage_events set started_at=clock_timestamp()-interval '10 days'
  where user_id=u and kind='REQUEST' and event_id=stuck;
 r:=public.anota_usage_take(u,'REQUEST',stuck,1,repeat('a',64));
 if r->'duplicate' is distinct from 'true'::jsonb or r->>'result' is not null or r->>'expires_at' is not null then
  raise exception 'BASELINE_CHANGED_CHECK_REQUEST_RECOVERY';
 end if;
 insert into request_baseline_observations values('BUG: crash leaves REQUEST permanently open without deadline',r);

 -- Result committed, HTTP response lost. Identical retry replays it; no new unit.
 perform public.anota_usage_take(u,'REQUEST',done,1,repeat('b',64));
 if not public.anota_usage_settle(u,done,'REQUEST',1,first_result) then raise exception 'INITIAL_SETTLE_FAILED';end if;
 r:=public.anota_usage_take(u,'REQUEST',done,1,repeat('b',64));
 if r->'duplicate' is distinct from 'true'::jsonb or r->'result' is distinct from first_result then raise exception 'REPLAY_BROKEN';end if;
 if public.anota_usage_settle(u,done,'REQUEST',0,'{"overwritten":true}') then raise exception 'COMPLETED_OVERWRITTEN';end if;
 insert into request_baseline_observations values('PRESERVE: completed result replayed and cannot be overwritten',r);
 r:=public.anota_usage_take(u,'REQUEST',done,1,repeat('c',64));
 if r->>'error' is distinct from 'REUSED' then raise exception 'FINGERPRINT_NOT_ENFORCED';end if;
 insert into request_baseline_observations values('PRESERVE: same event with divergent fingerprint rejected',r);
 r:=public.anota_usage_take(other,'REQUEST',done,1,repeat('b',64));
 if r ? 'duplicate' or r ? 'error' or r->>'result' is not null then raise exception 'OWNER_ISOLATION_BROKEN';end if;
 insert into request_baseline_observations values('PRESERVE: another owner cannot replay first owner result',r);

 -- Attempt A releases after failure; B reacquires same event. A's late completion
 -- then settles B's open row because the legacy RPC has no attempt token/fence.
 perform public.anota_usage_take(u,'REQUEST',race,1,repeat('d',64));
 if not public.anota_usage_settle(u,race,'REQUEST',0) then raise exception 'RELEASE_FAILED';end if;
 r:=public.anota_usage_take(u,'REQUEST',race,1,repeat('d',64));
 if r ? 'duplicate' or r ? 'error' then raise exception 'REACQUIRE_FAILED';end if;
 settled:=public.anota_usage_settle(u,race,'REQUEST',1,'{"attempt":"old-A","saved":false}');
 if not settled then raise exception 'BASELINE_CHANGED_CHECK_REQUEST_FENCE';end if;
 if public.anota_usage_settle(u,race,'REQUEST',1,'{"attempt":"new-B","saved":false}') then raise exception 'BASELINE_UNEXPECTED_SECOND_SETTLE';end if;
 select result into r from public.anota_usage_events where user_id=u and kind='REQUEST' and event_id=race;
 if r->>'attempt' is distinct from 'old-A' then raise exception 'BASELINE_RACE_NOT_REPRODUCED';end if;
 insert into request_baseline_observations values('BUG: old attempt settles newly acquired REQUEST; current owner loses CAS',r);
 if (public.anota_usage_summary(u)->>'requests')::integer<>3 or (public.anota_usage_summary(other)->>'requests')::integer<>1 then
  raise exception 'BASELINE_USAGE_UNEXPECTED';
 end if;
 if exists(select 1 from public.anota_finance_operations where user_id in(u,other)) then raise exception 'FINANCE_SIDE_EFFECT';end if;
 insert into request_baseline_observations values('PRESERVE: retry uses one event/unit and never applies finance',jsonb_build_object('owner_units',3,'other_units',1,'finance_operations',0));
end $$;
select * from request_baseline_observations order by case_name;
-- Six observations, including TWO CONFIRMED DEFECTS. A successful exit means
-- baseline reproduction completed, NOT that REQUEST recovery/fencing is safe.
rollback;
