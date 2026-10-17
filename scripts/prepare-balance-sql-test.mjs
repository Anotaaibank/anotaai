import {writeFileSync,readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {buildFinancePlan,balanceBasis} from '../lib/finance.ts';
import {brazilDay} from '../lib/model.ts';
const user=randomUUID(),other=randomUUID(),today=brazilDay(),stamp=today+'T10:00:00.000Z';
const state={documents:[],expenses:[]};
for(const command of [{action:'profile_upsert',profile:{opening_balance_cents:100000,opening_date:today}},{action:'income_upsert',description:'Receita sintética',amount_cents:30000,date:today},{action:'expense_create',description:'Despesa sintética',category:'Supermercado',amount_cents:20000,date:today}]){
 const p=buildFinancePlan(command,state,user,randomUUID(),today);state.documents.push(...p.documents.map(c=>({...c.document,updated_at:stamp})));state.expenses.push(...p.expenses.map(c=>({...c.payload,user_id:user,active:true,created_at:stamp,updated_at:stamp,origin:'MANUAL'})));
}
const plan=buildFinancePlan({action:'balance_adjust',balance_cents:150000},state,user,randomUUID(),today),literal=v=>"'"+String(v).replaceAll("'","''")+"'",j=v=>literal(JSON.stringify(v))+'::jsonb';
let sql=`begin;\ninsert into auth.users(id,email,aud,role,created_at,updated_at) values('${user}','${user}@example.invalid','authenticated','authenticated',now(),now()),('${other}','${other}@example.invalid','authenticated','authenticated',now(),now());\ninsert into public.anota_access_accounts(user_id,exempt) values('${user}',true),('${other}',true);\n`;
for(const d of state.documents)sql+=`insert into public.anota_finance_documents(id,user_id,data,updated_at) values('${d.id}','${user}',${j(d)},'${stamp}');\n`;
for(const e of state.expenses)sql+=`insert into public.anota_expenses(id,user_id,kind,scope,entry_date,status,description,category,amount_cents,details,active,origin,created_at,updated_at) values('${e.id}','${user}','${e.kind}','${e.scope}','${e.entry_date}','${e.status}',${literal(e.description)},${literal(e.category)},${e.amount_cents},${j(e.details)},true,'MANUAL','${stamp}','${stamp}');\n`;
sql+=`do $audit$ declare p jsonb:=${j(plan)};r jsonb;context jsonb;bad jsonb;begin
 context:=anota_private.balance_context('${user}');
 if context->>'basis_hash'<>'${balanceBasis(state)}' or (context->>'balance_cents')::bigint<>110000 then raise exception 'JS_SQL_BASIS_MISMATCH';end if;
 bad:=jsonb_set(p,'{documents,0,document,details,delta_cents}','999');
 begin perform anota_private.apply_finance('${user}',bad,'WHATSAPP');raise exception 'FORGED_DELTA_ACCEPTED';exception when others then if sqlerrm<>'ANOTA_FORBIDDEN' then raise;end if;end;
 bad:=jsonb_set(p,'{documents,0,document,active}','null');
 begin perform anota_private.apply_finance('${user}',bad,'WHATSAPP');raise exception 'NULL_ACTIVE_ACCEPTED';exception when others then if sqlerrm<>'ANOTA_FORBIDDEN' then raise;end if;end;
 begin perform anota_private.apply_finance('${other}',p,'WHATSAPP');raise exception 'OTHER_OWNER_ACCEPTED';exception when others then if sqlerrm not in ('ANOTA_BALANCE_SETUP','ANOTA_FORBIDDEN') then raise;end if;end;
 r:=anota_private.apply_finance('${user}',p,'WHATSAPP');
 if r->>'saved'<>'true' then raise exception 'NO_RECEIPT';end if;
 if (anota_private.balance_context('${user}')->>'balance_cents')::bigint<>150000 then raise exception 'WRONG_RESULT';end if;
 r:=anota_private.apply_finance('${user}',p,'WHATSAPP');if r->>'replayed'<>'true' then raise exception 'REPLAY_DUPLICATES';end if;
 if(select count(*) from public.anota_finance_documents where user_id='${user}' and data->>'kind'='INCOME')<>1 or (select count(*) from public.anota_expenses where user_id='${user}')<>1 then raise exception 'HISTORY_CHANGED';end if;
 if(select data->'details'->>'opening_balance_cents' from public.anota_finance_documents where user_id='${user}' and data->>'kind'='PROFILE')<>'100000' then raise exception 'OPENING_BALANCE_CHANGED';end if;
 bad:=jsonb_set(p,'{id}',to_jsonb(gen_random_uuid()::text));bad:=jsonb_set(bad,'{documents,0,document,id}',to_jsonb(gen_random_uuid()::text));
 begin perform anota_private.apply_finance('${user}',bad,'WHATSAPP');raise exception 'STALE_PLAN_ACCEPTED';exception when others then if sqlerrm<>'ANOTA_BALANCE_CHANGED' then raise;end if;end;
 bad:=jsonb_set(p,'{id}',to_jsonb(gen_random_uuid()::text));
 begin perform anota_private.apply_finance('${user}',bad,'WHATSAPP');raise exception 'HISTORIC_UPDATE_ACCEPTED';exception when others then if sqlerrm<>'ANOTA_BALANCE_IMMUTABLE' then raise;end if;end;
end $audit$;
set local role authenticated;
select set_config('request.jwt.claim.sub','${user}',true);
do $$declare r jsonb;begin r:=public.anota_apply_finance(${j(plan)},'VOICE');if r->>'replayed'<>'true' then raise exception 'AUTHENTICATED_RPC_REPLAY_FAILED';end if;end $$;
select set_config('request.jwt.claim.sub','${other}',true);
do $$begin
 if exists(select 1 from public.anota_finance_documents where user_id='${user}') then raise exception 'CROSS_OWNER_READ';end if;
 begin perform public.anota_apply_finance(${j(plan)},'VOICE');raise exception 'CROSS_OWNER_RPC_ACCEPTED';exception when others then if sqlerrm not in ('ANOTA_FORBIDDEN','ANOTA_CHANGED') then raise;end if;end;
end $$;
reset role;
do $$begin if has_function_privilege('authenticated','anota_private.apply_finance(uuid,jsonb,text)','execute') then raise exception 'PRIVATE_WRITER_EXPOSED';end if;end $$;
select 'balance_audit_ok' as result;
rollback;\n`;
writeFileSync('.data/balance-test-only.sql',sql);
const migration=readFileSync('supabase/migrations/20261017134237_current_balance_adjustment.sql','utf8');
writeFileSync('.data/balance-dry-run.sql','begin;\n'+migration+'\n'+sql.replace(/^begin;\n/,'').replace(/rollback;\s*$/,'')+'\nrollback;');
console.log('SQL sintético preparado com rollback obrigatório.');
