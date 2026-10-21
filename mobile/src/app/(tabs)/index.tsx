import {router} from 'expo-router';
import {Text} from 'react-native';
import {useSnapshot} from '@/components/use-snapshot';
import {Action,Busy,Card,Label,Notice,Page} from '@/components/ui';
import {formatMoney} from '@/core/forms';
import {useTheme} from '@/providers/theme';
import {useSession} from '@/providers/session';
export default function Overview(){const {data,error,loading,refresh}=useSnapshot(),{colors}=useTheme(),{user}=useSession();return <Page title={'Olá, '+(user?.name.split(' ')[0]||'você')} subtitle="Uma visão clara do seu mês."><Action label="＋ Entradas e saídas" onPress={()=>router.push('/entry')}/>{loading?<Busy/>:null}<Notice error={error}/>{data?<>{[['Salário mensal',data.snapshot.profile.salary_cents],['Saldo na conta',data.snapshot.balance_cents],['Contas a pagar no mês',data.snapshot.pending_month_cents],['Já gastei neste mês',data.snapshot.paid_month_cents],['Saldo após as contas',data.snapshot.available_month_cents]].map(([label,amount])=><Card key={String(label)}><Label muted>{label}</Label><Text selectable style={{fontSize:30,fontWeight:'700',color:colors.text,fontVariant:['tabular-nums']}}>{formatMoney(Number(amount))}</Text></Card>)}{data.snapshot.alerts.map((a,i)=><Card key={i}><Label>{a}</Label></Card>)}</>:null}<Action secondary label="Atualizar valores" onPress={()=>void refresh()} disabled={loading}/><Action secondary label="Ver minha agenda" onPress={()=>router.push('/agenda')}/></Page>;}
