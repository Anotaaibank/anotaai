import {randomUUID} from 'node:crypto';
import {authorize,body,failure,json,sameOrigin} from '@/lib/server';
import {buildFinancePlan,financeSnapshot,signFinance,readFinance} from '@/lib/finance';
import {financeState,financeSecret,applyFinance} from '@/lib/finance-server';
export const runtime='nodejs';
export async function GET(){try{const auth=await authorize();return json(financeSnapshot(await financeState(auth)));}catch(error){return failure(error);}}
export async function POST(req:Request){try{sameOrigin(req);const auth=await authorize(),input=await body(req,125000);if(input.confirmation){const plan=readFinance(input.confirmation,auth.user.id,financeSecret());return json(await applyFinance(auth,plan));}const plan=buildFinancePlan(input.command,await financeState(auth),auth.user.id,randomUUID());return json({ok:true,saved:false,pending:{title:plan.title,lines:plan.lines,confirmation:signFinance(plan,auth.user.id,financeSecret())}});}catch(error){return failure(error);}}
