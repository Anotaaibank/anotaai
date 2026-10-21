import {useState} from 'react';
import type {Pending} from '@/core/contracts';
import {useSession} from '@/providers/session';
import {Action,Card,Label,Notice} from './ui';
export function Confirmation({pending,onSaved,onEdit}:{pending:Pending;onSaved:()=>void;onEdit:()=>void}){const {call}=useSession(),[busy,setBusy]=useState(false),[error,setError]=useState('');async function confirm(){if(busy)return;setBusy(true);setError('');try{await call({action:'confirm',confirmation:pending.confirmation});onSaved();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}return <Card><Label>{pending.title}</Label>{pending.lines.map((line,i)=><Label key={i} muted>{line}</Label>)}<Notice error={error}/><Action label={busy?'Confirmando…':'1 · Confirmar'} onPress={()=>void confirm()} disabled={busy}/><Action label="2 · Editar" onPress={onEdit} secondary disabled={busy}/></Card>;}
