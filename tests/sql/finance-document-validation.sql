-- SYNTHETIC ONLY. Full migration chain, disposable PostgreSQL, owner role.
-- Requires the runner's matching anotei.test_run marker and anotei_test_<UUID>
-- database name. Never run on production or opt in an existing real database.
-- No permanent fixtures: all temporary helpers/results are rolled back.
begin;
do $$declare marker text:=coalesce(current_setting('anotei.test_run',true),'');begin
 if marker !~ '^anotei-disposable:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or current_database() is distinct from 'anotei_test_'||replace(split_part(marker,':',2),'-','') then
  raise exception 'DISPOSABLE_SQL_OPT_IN_REQUIRED';
 end if;
 if to_regprocedure('anota_private.validate_finance_document(jsonb)') is null then
  raise exception 'FINANCE_VALIDATOR_REQUIRED';
 end if;
end $$;

create temporary table finance_validation_results(label text,expected_valid boolean,actual_valid boolean,error_code text,error_message text);
create function pg_temp.check_finance_validation(label text,p jsonb,expected_valid boolean) returns void language plpgsql as $$
declare actual_valid boolean:=false;error_code text;error_message text;
begin
 begin
  perform anota_private.validate_finance_document(p);actual_valid:=true;
 exception when others then
  get stacked diagnostics error_code=returned_sqlstate,error_message=message_text;
 end;
 insert into finance_validation_results values(label,expected_valid,actual_valid,error_code,error_message);
end $$;

do $$
declare today text:=to_char(clock_timestamp() at time zone 'America/Sao_Paulo','YYYY-MM-DD');
 base jsonb;doc jsonb;kind text;field text;details jsonb;required text[];
begin
 base:=jsonb_build_object('id','ca520000-1111-4111-8111-111111111111','description','Teste sintético','date',today,'amount_cents',100,'status','REALIZADO','active',true);
 for kind,details,required in select * from (values
  ('PROFILE',jsonb_build_object('salary_cents',0,'salary_day',5,'opening_balance_cents',-100,'opening_date',today,'overdraft_limit_cents',0,'overdraft_monthly_rate',0,'safety_buffer_cents',0),array['salary_cents','salary_day','opening_balance_cents','opening_date','overdraft_limit_cents','overdraft_monthly_rate','safety_buffer_cents']),
  ('INCOME','{"salary":false}'::jsonb,array['salary']),
  ('RESERVE','{"rate_percent":0,"rate_period":"MENSAL"}'::jsonb,array['rate_percent','rate_period']),
  ('TRANSFER','{"reserve_id":"ca520000-2222-4222-8222-222222222222","direction":"APORTE"}'::jsonb,array['reserve_id','direction']),
  ('APPOINTMENT','{"done":false}'::jsonb,array['done']),
  ('BILL_RULE','{"day":5,"category":"MORADIA","payment_method":"BOLETO"}'::jsonb,array['day','category','payment_method']),
  ('BALANCE_ADJUSTMENT','{"previous_balance_cents":100,"target_balance_cents":200,"delta_cents":100,"basis_hash":"0123456789abcdef0123456789abcdef"}'::jsonb,array['previous_balance_cents','target_balance_cents','delta_cents','basis_hash'])
 ) as cases(kind,details,required) loop
  doc:=base||jsonb_build_object('kind',kind,'details',details);
  if kind='BILL_RULE' then doc:=doc||'{"status":"PREVISTO"}'::jsonb;end if;
  perform pg_temp.check_finance_validation(kind||': valid minimal stored document',doc,true);
  foreach field in array array['id','kind','description','date','amount_cents','status','active','details'] loop
   perform pg_temp.check_finance_validation(kind||': missing top '||field,doc-field,false);
   perform pg_temp.check_finance_validation(kind||': null top '||field,jsonb_set(doc,array[field],'null'::jsonb),false);
  end loop;
  foreach field in array required loop
   perform pg_temp.check_finance_validation(kind||': missing detail '||field,jsonb_set(doc,'{details}',details-field),false);
   perform pg_temp.check_finance_validation(kind||': null detail '||field,jsonb_set(doc,array['details',field],'null'::jsonb),false);
  end loop;
  perform pg_temp.check_finance_validation(kind||': unknown top field',doc||'{"unexpected":true}',false);
  perform pg_temp.check_finance_validation(kind||': unknown detail',jsonb_set(doc,'{details}',details||'{"unexpected":true}'),false);
 end loop;

 doc:=base||'{"kind":"PROFILE"}'::jsonb||jsonb_build_object('details',jsonb_build_object('salary_cents',0,'salary_day',5,'opening_balance_cents',-100,'opening_date',today,'overdraft_limit_cents',0,'overdraft_monthly_rate',0,'safety_buffer_cents',0));
 perform pg_temp.check_finance_validation('PROFILE: optional extra income false',jsonb_set(doc,'{details,has_extra_income}','false'),true);
 perform pg_temp.check_finance_validation('PROFILE: optional extra income null',jsonb_set(doc,'{details,has_extra_income}','null'),false);
 perform pg_temp.check_finance_validation('PROFILE: inactive',jsonb_set(doc,'{active}','false'),false);
 perform pg_temp.check_finance_validation('PROFILE: salary day 32',jsonb_set(doc,'{details,salary_day}','32'),false);
 perform pg_temp.check_finance_validation('PROFILE: rate above limit',jsonb_set(doc,'{details,overdraft_monthly_rate}','101'),false);
 doc:=base||'{"kind":"INCOME","details":{"salary":false}}'::jsonb;
 perform pg_temp.check_finance_validation('INCOME: optional activity string',jsonb_set(doc,'{details,activity}','"Serviço extra"'),true);
 perform pg_temp.check_finance_validation('INCOME: optional activity null',jsonb_set(doc,'{details,activity}','null'),false);
 perform pg_temp.check_finance_validation('INCOME: salary zero',jsonb_set(doc,'{amount_cents}','0'),false);
 perform pg_temp.check_finance_validation('INCOME: future realized',jsonb_set(doc,'{date}',to_jsonb(((today::date)+1)::text)),false);
 doc:=base||'{"kind":"APPOINTMENT","details":{"done":false}}'::jsonb;
 perform pg_temp.check_finance_validation('APPOINTMENT: optional empty time/location',jsonb_set(doc,'{details}','{"done":false,"time":"","location":""}'),true);
 perform pg_temp.check_finance_validation('APPOINTMENT: optional valid time/location',jsonb_set(doc,'{details}','{"done":true,"time":"19:00","location":"Igreja"}'),true);
 foreach field in array array['time','location'] loop
  perform pg_temp.check_finance_validation('APPOINTMENT: optional null '||field,jsonb_set(doc,array['details',field],'null'),false);
  perform pg_temp.check_finance_validation('APPOINTMENT: optional numeric '||field,jsonb_set(doc,array['details',field],'25'),false);
 end loop;
 perform pg_temp.check_finance_validation('APPOINTMENT: invalid time',jsonb_set(doc,'{details,time}','"25:00"'),false);
 doc:=base||'{"kind":"BILL_RULE","status":"PREVISTO","details":{"day":22,"category":"TRANSPORTE","payment_method":"BOLETO"}}'::jsonb;
 perform pg_temp.check_finance_validation('BILL_RULE: realized prohibited',jsonb_set(doc,'{status}','"REALIZADO"'),false);
 perform pg_temp.check_finance_validation('BILL_RULE: day 0',jsonb_set(doc,'{details,day}','0'),false);
 perform pg_temp.check_finance_validation('BILL_RULE: fractional day',jsonb_set(doc,'{details,day}','5.5'),false);
 perform pg_temp.check_finance_validation('BILL_RULE: invalid method',jsonb_set(doc,'{details,payment_method}','"INVALID"'),false);
 doc:=base||'{"kind":"BALANCE_ADJUSTMENT","details":{"previous_balance_cents":100,"target_balance_cents":200,"delta_cents":100,"basis_hash":"0123456789abcdef0123456789abcdef"}}'::jsonb;
 perform pg_temp.check_finance_validation('BALANCE_ADJUSTMENT: inconsistent delta',jsonb_set(doc,'{details,delta_cents}','150'),false);
 perform pg_temp.check_finance_validation('BALANCE_ADJUSTMENT: inconsistent amount',jsonb_set(doc,'{amount_cents}','150'),false);
 perform pg_temp.check_finance_validation('BALANCE_ADJUSTMENT: inactive',jsonb_set(doc,'{active}','false'),false);
 perform pg_temp.check_finance_validation('BALANCE_ADJUSTMENT: invalid hash',jsonb_set(doc,'{details,basis_hash}','"bad"'),false);
 perform pg_temp.check_finance_validation('BALANCE_ADJUSTMENT: future',jsonb_set(doc,'{date}',to_jsonb(((today::date)+1)::text)),false);
 perform pg_temp.check_finance_validation('BALANCE_ADJUSTMENT: projected prohibited',jsonb_set(doc,'{status}','"PREVISTO"'),false);
 perform pg_temp.check_finance_validation('SQL null document',null,false);
 perform pg_temp.check_finance_validation('JSON null document','null',false);
 perform pg_temp.check_finance_validation('array document','[]',false);
end $$;

select count(*) as total,count(*) filter(where expected_valid=actual_valid) as passed,count(*) filter(where expected_valid<>actual_valid) as failed from finance_validation_results;
select * from finance_validation_results where expected_valid<>actual_valid order by label;
do $$begin
 if exists(select 1 from finance_validation_results where expected_valid<>actual_valid) then
  raise exception 'FINANCE_VALIDATION_REGRESSION';
 end if;
end $$;
rollback;
