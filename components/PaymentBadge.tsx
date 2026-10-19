'use client';
import {Localize} from '@/components/Localization';
import type {AdminEntry} from '@/lib/expenses';
import {paymentStatus} from '@/lib/payment-status';
export default function PaymentBadge({row,today}:{row:AdminEntry;today?:string}){
 const status=paymentStatus(row,today);
 return <Localize><span className={'bank-pill payment-status payment-'+status.kind}>{status.label}{status.days>0&&<small>{status.days} {status.days===1?'dia':'dias'} em atraso</small>}</span></Localize>;
}
