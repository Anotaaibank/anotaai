-- Clear conversational context, not financial/account history or event deduplication.
alter table public.anota_whatsapp_inbox add column context_reset_at timestamptz;

create function public.anota_reset_whatsapp_context(p_actor uuid,p_phone text,p_expected timestamptz,p_request uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare invite public.anota_whatsapp_invitations; prior public.anota_audit_logs; revision timestamptz; affected integer; result jsonb;
begin
 if p_request is null or p_phone!~'^55[0-9]{10,11}$' or not exists(select 1 from public.anota_access_accounts where user_id=p_actor and exempt and disabled_at is null) then raise exception 'ANOTA_FORBIDDEN';end if;
 perform pg_advisory_xact_lock(hashtextextended('anotei-phone:'||p_phone,0));
 select * into invite from public.anota_whatsapp_invitations where owner_id=p_actor and phone=p_phone for update;
 if invite.id is null or invite.user_id is null or not exists(select 1 from public.anota_whatsapp_bots where user_id=p_actor and shared_owner_id is null) then raise exception 'ANOTA_FORBIDDEN';end if;
 select * into prior from public.anota_audit_logs where id=p_request;
 if found then
  if prior.user_id<>p_actor or prior.entity_id is distinct from invite.id or prior.action<>'CONVERSA_IA_REINICIADA' then raise exception 'ANOTA_FORBIDDEN';end if;
  return prior.details;
 end if;
 if p_expected is null or invite.updated_at<>p_expected then raise exception 'ANOTA_CHANGED';end if;
 revision:=greatest(clock_timestamp(),invite.updated_at+interval '1 millisecond');
 update public.anota_whatsapp_inbox set context_reset_at=revision,finance_confirmation='',confirmation_code='',confirmation_used=true,lease=null,claimed_at=null,
  reply=case when status in ('FILA','PROCESSANDO') then 'Conversa reiniciada pela gestão. Envie um novo pedido.' else reply end,
  reply_status=case when status in ('FILA','PROCESSANDO') or reply_status in ('NAO_ENVIADO','ENVIANDO') then 'CANCELADO' else reply_status end,
  status=case when status in ('FILA','PROCESSANDO') then 'RESOLVIDO' else status end
 where user_id=invite.user_id and sender=p_phone and provider_id not like 'anotei-reminder:v1:%';
 get diagnostics affected=row_count;
 update public.anota_whatsapp_invitations set updated_at=revision where id=invite.id;
 result:=jsonb_build_object('affected_messages',affected,'reset_at',revision);
 insert into public.anota_audit_logs(id,user_id,entity_id,action,details) values(p_request,p_actor,invite.id,'CONVERSA_IA_REINICIADA',result);
 return result;
end $$;
revoke all on function public.anota_reset_whatsapp_context(uuid,text,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.anota_reset_whatsapp_context(uuid,text,timestamptz,uuid) to service_role;
