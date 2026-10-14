import {AppError,brazilDay} from './model.ts';
import {registerLocal} from './local-db.ts';
import {invitationForToken,bindPersonalInvitation} from './whatsapp-members-local.ts';
import {buildFinancePlan,profileInput} from './finance.ts';
import {applyLocalFinance} from './finance-store.ts';
import {randomUUID} from 'node:crypto';
import {confirmedRegistrationPassword} from './registration-password.ts';
export function registrationMoney(raw:unknown,negative=false){
 if(typeof raw!=='string')throw new AppError('Informe seu salário e seu saldo atual.');let value=raw.trim().replace(/^R\$\s*/i,'');
 if(/^-?\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(value))value=value.replaceAll('.','');
 if(!/^-?\d{1,7}(?:[.,]\d{1,2})?$/.test(value))throw new AppError('Informe os valores em reais, como 6500,00.');
 const [whole,fraction='']=value.replace(',','.').split('.'),sign=value.startsWith('-')?-1:1,cents=sign*(Math.abs(Number(whole))*100+Number(fraction.padEnd(2,'0')));
 if(!Number.isSafeInteger(cents)||Math.abs(cents)>1000000000||!negative&&cents<0)throw new AppError('Confira o valor informado.');return cents;
}
export function registerPersonalInvitation(input:Record<string,unknown>,today=brazilDay()){
 confirmedRegistrationPassword(input.password,input.password_confirmation);
 if(typeof input.email!=='string'||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())||input.email.length>254||typeof input.name!=='string'||input.name.trim().length<2||input.name.length>80||typeof input.password!=='string'||input.password.length<10||input.password.length>128)throw new AppError('Confira nome, e-mail e uma senha de pelo menos 10 caracteres.');
 const invite=invitationForToken(input.invitation);if(!invite)throw new AppError('Este convite foi utilizado, expirou ou foi cancelado. Peça um novo link.',409);
 const profile=profileInput({salary_cents:registrationMoney(input.salary),opening_balance_cents:registrationMoney(input.balance,true),opening_date:today,salary_day:Number(input.salary_day||5)},today);
 return registerLocal(String(input.email).trim().toLowerCase(),String(input.password),String(input.name).trim(),input.assistant_name,user=>{
  bindPersonalInvitation(String(input.invitation),user);
  applyLocalFinance(user,buildFinancePlan({action:'profile_upsert',profile},{documents:[],expenses:[]},user,randomUUID(),today),'MANUAL');
 });
}
