-- Only inside BEGIN / ROLLBACK. Placeholders are synthetic UUIDs / JSON.
insert into auth.users(id,email,aud,role,created_at,updated_at) values
 ('__USER__','calendar-fixture@example.invalid','authenticated','authenticated',now(),now()),
 ('__OTHER__','calendar-other@example.invalid','authenticated','authenticated',now(),now());
insert into public.anota_access_accounts(user_id,exempt) values('__USER__',true);
insert into public.anota_whatsapp_bots(user_id,phone,allowed_phones,enabled,status,hook_cipher)
 values('__USER__','5511988888898',array['5511988888897'],true,'PRONTO','synthetic');
insert into public.anota_whatsapp_inbox(id,user_id,provider_id,sender,type,status,lease,claimed_at)
 values('__MESSAGE__','__USER__','calendar-synthetic','5511988888897','text','PROCESSANDO','__LEASE__',now());
set local role service_role;
do $$declare result jsonb;plan jsonb:='__PLAN__'::jsonb;begin
 result:=public.anota_apply_finance_whatsapp('__USER__',plan,'__MESSAGE__','__LEASE__');
 if result->>'saved'<>'true' or result->>'operation_id'<>plan->>'id' then raise exception 'MISSING_PERSISTENCE_RECEIPT';end if;
 result:=public.anota_apply_finance_whatsapp('__USER__',plan,'__MESSAGE__','__LEASE__');
 if result->>'replayed'<>'true' then raise exception 'REPLAY_NOT_IDEMPOTENT';end if;
 if (select count(*) from public.anota_expenses where user_id='__USER__' and status='PREVISTO')<>12 then raise exception 'MISSING_RECURRING_DUES';end if;
 if (select count(*) from public.anota_finance_documents where user_id='__USER__' and data->>'kind'='APPOINTMENT' and data->>'date'='2026-11-07' and data->'details'->>'time'='19:00')<>1 then raise exception 'MISSING_CALENDAR_EVENT';end if;
 begin perform public.anota_apply_finance_whatsapp('__OTHER__',plan,'__MESSAGE__','__LEASE__');raise exception 'OTHER_OWNER_ACCEPTED';exception when others then if sqlerrm<>'ANOTA_FORBIDDEN' then raise;end if;end;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','__USER__',true);
do $$begin if(select count(*) from public.anota_expenses)<>12 or(select count(*) from public.anota_finance_documents)<>2 then raise exception 'AUTHENTICATED_APP_CANNOT_SEE_WHATSAPP_DATA';end if;end $$;
select set_config('request.jwt.claim.sub','__OTHER__',true);
do $$begin if exists(select 1 from public.anota_expenses) or exists(select 1 from public.anota_finance_documents) then raise exception 'CROSS_OWNER_READ';end if;end $$;
reset role;
